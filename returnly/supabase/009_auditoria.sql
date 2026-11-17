-- Auditoría (ya aplicada en Supabase): quién hizo qué cambio sobre empresas y usuarios, y cuándo.
-- actor = quien hizo la acción: un admin, el propio usuario (al cambiar su contraseña) o 'sistema'
-- (bloqueos automáticos por intentos fallidos, con actor_id vacío).
create table auditoria (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  actor_id        uuid references usuario(id),
  actor_usuario   text,
  accion          text not null,                 -- 'Bloqueó al usuario', 'Creó la empresa', 'Bloqueo automático'...
  objetivo_tipo   text not null check (objetivo_tipo in ('usuario', 'empresa')),
  objetivo_id     text,
  objetivo_nombre text,
  detalle         text,
  ip              text
);
create index on auditoria (fecha desc);

-- Igual que las otras tablas: RLS sin políticas, solo el backend (clave secreta) puede leer y escribir.
alter table auditoria enable row level security;
revoke all on auditoria from anon, authenticated;
