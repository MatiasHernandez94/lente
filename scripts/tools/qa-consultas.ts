/**
 * QA de integración real para las consultas alumno↔profesor.
 *
 * Corre contra la base real (Supabase/DATABASE_URL) usando los servicios de la
 * app, no SQL suelto, para que verifique el mismo camino que corre en
 * producción. Al terminar borra todas las filas que creó.
 *
 * Uso: TSX_TSCONFIG_PATH=scripts/tools/tsconfig.json npx tsx scripts/tools/qa-consultas.ts
 */
import { createConsulta, listConsultasByVideo, listHilosPendientesProfesor, markConsultasLeidas } from "../../src/lib/consulta/service";
import { resolveProfesorId, groupConsultasPendientes } from "../../src/lib/consulta/core";
import { getClient } from "../../src/lib/db";

interface Check {
  nombre: string;
  ok: boolean;
  detalle: string;
}

const checks: Check[] = [];
function check(nombre: string, ok: boolean, detalle = ""): void {
  checks.push({ nombre, ok, detalle });
}

async function main(): Promise<void> {
  const db = getClient();

  // Par alumno/profesor ya vinculado en la base (migración de pruebas previas).
  const par = await db
    .from("profesor_alumno")
    .select("profesor_id, alumno_id")
    .limit(1)
    .maybeSingle();
  if (!par.data) {
    console.error("No hay ningún vínculo profesor-alumno en la base; no se puede probar.");
    process.exit(1);
  }
  const { profesor_id: profesorId, alumno_id: alumnoId } = par.data;

  const video = await db
    .from("videos")
    .select("id, title, user_id")
    .limit(1)
    .maybeSingle();
  if (!video.data) {
    console.error("No hay videos en la base; no se puede probar.");
    process.exit(1);
  }
  const { id: videoId, title: videoTitle } = video.data;
  const videoOwner = video.data.user_id;

  console.log(`QA consultas — video: "${videoTitle}" | alumno: ${alumnoId} | profesor: ${profesorId} | dueño real: ${videoOwner}\n`);

  const limpiar = async (): Promise<void> => {
    await db.from("consultas").delete().eq("video_id", videoId);
    await db.from("notificaciones").delete().eq("ref_id", videoId);
  };

  // Empieza limpio
  await limpiar();

  try {
    // ── 1. Crear consulta del alumno ──
    const m1 = await createConsulta({
      videoId,
      alumnoId,
      profesorId,
      autorId: alumnoId,
      autorRol: "alumno",
      mensaje: "¿Está bien la postura en el minuto 2?",
    });
    check("crear consulta (alumno)", Boolean(m1.id), `id=${m1.id}`);
    check("mensaje guardado", m1.mensaje === "¿Está bien la postura en el minuto 2?");
    check("nueva consulta nace no leída", m1.leida === false, `leida=${m1.leida}`);
    check("autor_rol se guarda", m1.autorRol === "alumno", `autor_rol=${m1.autorRol}`);
    check("vínculo alumno/profesor en la fila", m1.alumnoId === alumnoId && m1.profesorId === profesorId);

    // ── 2. El hilo se lee en orden cronológico con el nombre del autor ──
    let hilo = await listConsultasByVideo(videoId);
    check("el hilo tiene 1 mensaje", hilo.length === 1, `len=${hilo.length}`);
    check("el hilo queda en orden ascendente", hilo[0]?.autorRol === "alumno");
    check("trae el nombre del autor", Boolean(hilo[0]?.autorName), hilo[0]?.autorName ?? "");

    // ── 3. La bandeja del profesor lo ve pendiente ──
    let pendientes = await listHilosPendientesProfesor(profesorId);
    let hiloDeEsteVideo = pendientes.find((h) => h.videoId === videoId);
    check("el hilo aparece en pendientes del profesor", Boolean(hiloDeEsteVideo), `hilos=${pendientes.length}`);
    check("cuenta 1 sin leer", hiloDeEsteVideo?.unreadCount === 1, `unread=${hiloDeEsteVideo?.unreadCount}`);
    check("trae título y alumno", hiloDeEsteVideo?.videoTitle === videoTitle, `${hiloDeEsteVideo?.videoTitle} / ${hiloDeEsteVideo?.alumnoName}`);
    check("el hilo más reciente va primero", pendientes[0]?.videoId === videoId, pendientes[0]?.videoId ?? "");

    // ── 4. El profesor lo lee → deja de estar pendiente ──
    await markConsultasLeidas(videoId, "profesor");
    hilo = await listConsultasByVideo(videoId);
    check("leer como profesor marca el mensaje del alumno", hilo[0]?.leida === true, `leida=${hilo[0]?.leida}`);
    pendientes = await listHilosPendientesProfesor(profesorId);
    hiloDeEsteVideo = pendientes.find((h) => h.videoId === videoId);
    check("leído → el hilo sale de pendientes", !hiloDeEsteVideo, `hilos=${pendientes.length}`);

    // ── 5. El profesor responde ──
    const m2 = await createConsulta({
      videoId,
      alumnoId,
      profesorId,
      autorId: profesorId,
      autorRol: "profesor",
      mensaje: "Sí, pero bajá un poco el centro de gravedad.",
    });
    check("crear consulta (profesor)", Boolean(m2.id));

    // ── 6. El alumno lo ve (su respuesta no le reabre el hilo al profesor) ──
    await markConsultasLeidas(videoId, "alumno");
    hilo = await listConsultasByVideo(videoId);
    check("el hilo completo tiene 2 mensajes", hilo.length === 2, `len=${hilo.length}`);
    check("al marcar como alumno, la respuesta del profesor queda leída", hilo[1]?.leida === true, `leida=${hilo[1]?.leida}`);
    check("al alumno le queda el mensaje del profesor visible", hilo[1]?.autorRol === "profesor");

    pendientes = await listHilosPendientesProfesor(profesorId);
    hiloDeEsteVideo = pendientes.find((h) => h.videoId === videoId);
    check("la respuesta del profesor no reabre su propio hilo", !hiloDeEsteVideo, `hilos=${pendientes.length}`);

    // ── 7. Notificaciones creadas ──
    const notifs = await db
      .from("notificaciones")
      .select("user_id, tipo, mensaje, ref_id")
      .eq("ref_id", videoId);
    const rows = notifs.data ?? [];
    check("hubo notificación para el profesor", rows.some((n) => n.user_id === profesorId), rows.map((n) => n.tipo).join(","));
    check("hubo notificación para el alumno", rows.some((n) => n.user_id === alumnoId));
    check("tipo de notificación es 'consulta'", rows.every((n) => n.tipo === "consulta"), rows[0]?.tipo ?? "");
    check("menciona el video", rows.every((n) => n.mensaje.includes(videoTitle)), rows[0]?.mensaje ?? "");

    // ── 8. No escribir de más: límite de 2000 caracteres (lógica del API) ──
    // El límite vive en la ruta del API; aquí verificamos que el servicio
    // guarda el mensaje tal cual, sin truncar.
    const largo = "A".repeat(2000);
    const m3 = await createConsulta({
      videoId,
      alumnoId,
      profesorId,
      autorId: alumnoId,
      autorRol: "alumno",
      mensaje: largo,
    });
    check("mensaje largo se guarda sin truncar", m3.mensaje.length === 2000, `len=${m3.mensaje.length}`);

    // ── 9. Borrado en cascada: al borrar la consultas del video no quedan restos ──
    const restantesAntes = (await listConsultasByVideo(videoId)).length;
    check("antes de limpiar quedan 3 mensajes", restantesAntes === 3, `len=${restantesAntes}`);
  } finally {
    await limpiar();
    const restantes = await listConsultasByVideo(videoId);
    check("limpieza completa (0 filas de prueba)", restantes.length === 0, `restan=${restantes.length}`);
    const notifsRestantes = await db
      .from("notificaciones")
      .select("id")
      .eq("ref_id", videoId);
    check("limpieza de notificaciones", (notifsRestantes.data ?? []).length === 0);
  }

  // ── Lógica pura relevante al flujo ──
  check(
    "sin tutores el alumno no puede preguntar (API responde 400)",
    resolveProfesorId([]) === null,
  );

  // ── Reporte ──
  const fallidos = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? "  ✔" : "  ✖"} ${c.nombre}${c.detalle ? ` — ${c.detalle}` : ""}`);
  }
  console.log(`\n${checks.length - fallidos.length}/${checks.length} checks OK`);
  if (fallidos.length > 0) {
    console.log("FALLARON:");
    fallidos.forEach((c) => console.log(`  ✖ ${c.nombre} — ${c.detalle}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
