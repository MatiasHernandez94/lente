-- Migración: aprendizajes del coach (bucle de auto-mejora)
--
-- El coach guarda lo que aprende de cada análisis para inyectarlo como
-- "memoria dinámica" en los prompts siguientes, sin reentrenar modelos.
--
-- Dos orígenes, con alcances distintos:
--   * 'curado'   → lo escribimos nosotros a partir del conocimiento por deporte.
--                  Es global y le aparece a todos.
--   * 'usuario'  → feedback explícito del propio usuario sobre una corrección.
--                  Solo se le inyecta a él: los datos de un video ajeno no se
--                  cruzan entre cuentas.
--   * 'negativo' → algo que el agente se equivocó. Se inyecta como restricción
--                  ("no marques esto como error"), que es más barato y más
--                  estable que un ejemplo positivo.

create table public.coach_learnings (
  id          text primary key,
  -- 'curado' es global; 'usuario' y 'negativo' quedan atados a un usuario.
  origen       text not null check (origen in ('curado', 'usuario', 'negativo')),
  user_id      text references public.users(id) on delete cascade,
  -- Contexto de recuperación. Se busca por deporte + tipo de falla; no hace
  -- falta un vector store para eso.
  sport        text not null,
  error_type   text,
  -- El aprendizaje en una o dos oraciones, en lenguaje de entrenador.
  learning     text not null,
  -- De qué video salió (para poder auditar el origen de una recomendación).
  video_id     text references public.videos(id) on delete set null,
  -- Feedback del usuario: 1 = corrección acertada, 0 = no sirvió.
  rating       integer check (rating in (0, 1)),
  -- Veces que se inyectó este aprendizaje. Sirve para ver si se usa o si es
  -- ruerto acumulado.
  uses         integer not null default 0,
  created_at   text not null,
  updated_at   text not null
);

create index idx_coach_learnings_lookup
  on public.coach_learnings(origen, sport, error_type);

-- Un usuario no debería acumular el mismo aprendizaje dos veces.
create unique index idx_coach_learnings_dedupe
  on public.coach_learnings(coalesce(user_id, ''), sport, coalesce(error_type, ''), learning);
