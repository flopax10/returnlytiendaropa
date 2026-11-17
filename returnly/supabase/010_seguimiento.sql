-- Seguimiento de recomendaciones (ya aplicada en Supabase): cada empresa marca cada recomendación del Feedback
-- como pendiente / en curso / hecha y la vota 👍 (1) o 👎 (-1). Es por empresa (la comparten sus usuarios).
-- recomendacion_id es el id fijo de cada recomendación del portal ('perdemos', 'destacar', 'canales'...).
create table seguimiento (
  empresa_id        text not null references empresa(id),
  recomendacion_id  text not null check (recomendacion_id ~ '^[a-z0-9_-]{1,40}$'),
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha')),
  voto              smallint check (voto in (-1, 1)),       -- null = no votó
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid references usuario(id),
  primary key (empresa_id, recomendacion_id)
);

-- Igual que las otras tablas: RLS sin políticas, solo el backend (clave secreta) puede leer y escribir.
alter table seguimiento enable row level security;
revoke all on seguimiento from anon, authenticated;
