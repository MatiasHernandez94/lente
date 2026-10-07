/**
 * Alertas operativas hacia Telegram.
 *
 * Sólo debe importarse desde código de servidor (rutas de API, cron, worker).
 * No declara `server-only` para que los tests de `node:test` puedan probar el
 * formateo y el throttle: el token se lee de `process.env` en el momento del
 * envío, así que un bundle de cliente vería `undefined` y no filtraría nada.
 *
 * Sin `parse_mode`: los mensajes de error traen caracteres arbitrarios que
 * rompen MarkdownV2/HTML y harían que Telegram rechace la alerta (ok:false),
 * que es exactamente el problema que tenía el webhook de Slack sin configurar.
 */

export type AlertLevel = "error" | "warn";

export interface AlertInput {
  level: AlertLevel;
  /** Título corto y estable: es la clave del throttle. */
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/** Ventana mínima entre dos alertas con el mismo `level` + `title`. */
export const ALERT_THROTTLE_MS = 5 * 60_000;

const sentAt = new Map<string, number>();
let missingConfigWarned = false;

export function isAlertsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function formatAlert(alert: AlertInput, at: Date = new Date()): string {
  const lines = [
    `Lente · ${alert.level === "error" ? "ERROR" : "AVISO"}`,
    `${alert.title}`,
    at.toISOString(),
    alert.message,
  ];
  for (const [key, value] of Object.entries(alert.data ?? {})) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.join("\n");
}

/** Reinicia el estado de throttle. Solo para tests. */
export function resetAlertThrottle(): void {
  sentAt.clear();
  missingConfigWarned = false;
}

export async function sendAlert(alert: AlertInput): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      console.warn(
        "[alerts] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID sin configurar: las alertas se descartan.",
      );
    }
    return false;
  }

  const key = `${alert.level}:${alert.title}`;
  const now = Date.now();
  const last = sentAt.get(key);
  if (last !== undefined && now - last < ALERT_THROTTLE_MS) return false;
  sentAt.set(key, now);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatAlert(alert),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!response.ok || body?.ok === false) {
      console.error("[alerts] Telegram rechazó la alerta:", body?.description ?? response.status);
      // No dejamos el throttle puesto: el próximo aviso reintenta.
      sentAt.delete(key);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[alerts] No se pudo enviar la alerta:", error);
    sentAt.delete(key);
    return false;
  }
}
