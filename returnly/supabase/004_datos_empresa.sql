-- Foto de los datos de cada empresa para el panel. La llena el backend de Returnly todos los días (Vercel Cron)
-- o cuando el admin toca "Actualizar ahora". Así el panel abre al instante y no se consulta BigQuery en cada visita.
-- Igual que las otras tablas del admin: RLS activado SIN políticas, solo la lee y escribe el backend.

create table datos_empresa (
  empresa_id      text primary key references empresa(id),
  datos           jsonb,                                   -- resultado de todas las consultas de la fuente
  actualizado     timestamptz,                             -- cuándo se trajeron bien por última vez
  ultimo_intento  timestamptz not null default now(),
  error           text                                     -- si el último intento falló, por qué
);

alter table datos_empresa enable row level security;
revoke all on datos_empresa from anon, authenticated;
