-- Caché del feedback adaptado con IA (Gemini). Se guarda por empresa y por "huella" de los datos que se le
-- mandaron a la IA: mientras los datos no cambien, se reusa la respuesta y no se gasta cuota de la API.
create table if not exists feedback_ia (
  empresa_id text not null references empresa(id),
  huella text not null,
  modelo text not null,
  contenido jsonb not null,
  creado_en timestamptz not null default now(),
  primary key (empresa_id, huella)
);

-- Igual que las otras tablas: RLS sin políticas, solo el backend (clave secreta) puede leer y escribir.
alter table feedback_ia enable row level security;
revoke all on feedback_ia from anon, authenticated;
