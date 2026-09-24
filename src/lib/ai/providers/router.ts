import { GeminiProvider } from "./gemini";
import { AIQuotaError, type AIProvider } from "./types";

export interface ProviderConfig {
  apiKeys: string[];
  visionModel: string;
  agentModel: string;
}

interface ProviderClient extends AIProvider {
  readonly index: number;
}

function readConfig(): ProviderConfig {
  const keys = collectApiKeys();
  return {
    apiKeys: keys,
    visionModel: process.env.GEMINI_VISION_MODEL ?? "gemini-3.6-flash",
    agentModel: process.env.GEMINI_AGENT_MODEL ?? "gemini-3.6-flash",
  };
}

function collectApiKeys(): string[] {
  const keys: string[] = [];
  const pushValid = (value: string | undefined) => {
    if (value && value.trim()) {
      keys.push(value.trim());
    }
  };

  // GEMINI_API_KEY (una o varias separadas por coma)
  pushValid(process.env.GEMINI_API_KEY);

  // GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... (rotación)
  const commaKeys = process.env.GEMINI_API_KEY ?? "";
  for (const part of commaKeys.split(",")) {
    pushValid(part);
  }
  for (let i = 1; i <= 10; i++) {
    pushValid(process.env[`GEMINI_API_KEY_${i}`]);
  }

  // Dedupe manteniendo orden
  return [...new Set(keys)];
}

function buildClients(cfg: ProviderConfig): ProviderClient[] {
  const shared = { visionModel: cfg.visionModel, agentModel: cfg.agentModel };
  return cfg.apiKeys.map((apiKey, index) => {
    const client = new GeminiProvider({ apiKey, ...shared });
    return Object.assign(client, { index });
  });
}

/**
 * Capa de proveedores de IA con rotación.
 *
 * Mantiene una lista de clientes (una instancia por API key de Gemini). Cuando
 * una key agota cuota (429/resource exhausted), se rota automáticamente a la
 * siguiente. Si todas se agotan, devuelve AIQuotaError con kind "all_exhausted"
 * para que la UI muestre un mensaje amable. Si no hay ninguna key configurada,
 * devuelve AIQuotaError con kind "no_keys".
 */
export class AIProviderRouter {
  private readonly providers: ProviderClient[];
  private cursor = 0;

  constructor(cfg?: ProviderConfig) {
    const resolved = cfg ?? readConfig();
    this.providers = buildClients(resolved);
  }

  hasProviders(): boolean {
    return this.providers.length > 0;
  }

  async withRotation<T>(
    method: (provider: AIProvider) => Promise<T>,
  ): Promise<{ result: T; provider: string }> {
    if (this.providers.length === 0) {
      throw new AIQuotaError(
        "no_keys",
        "No hay ninguna API key de IA configurada. Agregá GEMINI_API_KEY en el entorno (backend) para activar el análisis con visión.",
      );
    }

    const n = this.providers.length;
    for (let attempt = 0; attempt < n; attempt++) {
      const provider = this.providers[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      try {
        return { result: await method(provider), provider: provider.name };
      } catch (error) {
        if (error instanceof AIQuotaError) {
          // Rotar a la siguiente key
          continue;
        }
        throw error;
      }
    }
    throw new AIQuotaError(
      "all_exhausted",
      "Se agotó la cuota gratuita de IA. Todas las API keys disponibles alcanzaron su límite; cuando se configure una key con plan de pago el análisis seguirá funcionando automáticamente.",
    );
  }
}

let singleton: AIProviderRouter | null = null;

/** Router compartido cacheado durante el ciclo de vida del proceso. */
export function getAIProviderRouter(): AIProviderRouter {
  if (!singleton) {
    singleton = new AIProviderRouter();
  }
  return singleton;
}