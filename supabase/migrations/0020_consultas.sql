-- Migración: consultas del alumno a su profesor
--
-- Hasta ahora la comunicación profesor→alumno era unidireccional: el profesor
-- dejaba `correcciones` y el alumno solo leía. No había forma de que el alumno
-- preguntara algo sobre su propio video.
--
-- Se modela como un hilo por video: cada fila es un mensaje y el hilo es el
-- conjunto de filas con el mismo `video_id`. No hace falta una tabla de hilos
-- porque "un hilo por video" es exactamente la relación video→mensajes.
--
-- `autor_rol` se guarda desnormalizado a propósito: saber si un mensaje lo
-- escribió el alumno o el profesor es lo que permite marcar "no leído" para el
-- receptor correcto sin un join extra contra `users` en cada lectura.

create table public.consultas (
  id          text primary key,
  video_id    text not null references public.videos(id) on delete cascade,
  -- Dueño del video (el alumno). Se fija al crear el primer mensaje.
  alumno_id   text not null references public.users(id) on delete cascade,
  -- Profesor que recibe la consulta. Queda fijo durante todo el hilo.
  profesor_id text not null references public.users(id) on delete cascade,
  autor_id    text not null references public.users(id) on delete cascade,
  autor_rol   text not null check (autor_rol in ('alumno', 'profesor')),
  mensaje     text not null,
  -- No leído para el receptor. El autor no marca leída su propia pregunta.
  leida       boolean not null default false,
  created_at  text not null
);

-- El hilo completo de un video, en orden cronológico de lectura.
create index idx_consultas_video on public.consultas(video_id, created_at);

-- Bandeja del profesor: lo no leído que le llegó, más reciente primero.
create index idx_consultas_profesor on public.consultas(profesor_id, leida, created_at desc);

-- Vista del alumno: sus consultas, más reciente primero.
create index idx_consultas_alumno on public.consultas(alumno_id, created_at desc);
