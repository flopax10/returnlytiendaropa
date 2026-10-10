-- Tablas de la pantalla Admin de seguridad de Returnly: empresas clientes, usuarios y registro de accesos.
-- Solo las usa el backend de Returnly (con la clave secreta de Supabase). Tienen RLS activado SIN políticas y
-- se les quitan los permisos a los roles públicos: con la clave publicable no se pueden leer ni escribir.

-- Empresas clientes. La KEY de Google de cada una se guarda ENCRIPTADA por el backend (AES-256-GCM);
-- la clave para desencriptarla vive solo en el servidor, nunca en la base.
create table empresa (
  id                  text primary key,                    -- ej. 'google-merch'
  nombre              text not null,
  fuente_tipo         text not null check (fuente_tipo in ('ga4', 'thelook')),
  fuente_config       jsonb not null default '{}',         -- ej. {"tabla": "proyecto.dataset.events_*"}
  credencial_cifrada  text,                                -- KEY de Google encriptada
  credencial_email    text,                                -- cuenta de servicio, para mostrar en el admin
  nota                text,                                -- aviso que ve la empresa arriba del panel
  activa              boolean not null default true,       -- baja lógica: no se borra
  creada_en           timestamptz not null default now()
);

-- Usuarios: admins de Returnly (sin empresa) y clientes (de una empresa, solo ven sus dashboards)
create table usuario (
  id             uuid primary key default gen_random_uuid(),
  usuario        text not null unique check (usuario = lower(usuario)),
  nombre         text not null,
  password_hash  text not null,                            -- scrypt
  rol            text not null check (rol in ('admin', 'cliente')),
  empresa_id     text references empresa(id),
  activo         boolean not null default true,            -- bloqueado = false
  creado_en      timestamptz not null default now(),
  ultimo_acceso  timestamptz,
  check ((rol = 'admin' and empresa_id is null) or (rol = 'cliente' and empresa_id is not null))
);

-- Registro de cada intento de ingreso (bueno o fallido)
create table acceso (
  id                 bigint generated always as identity primary key,
  usuario_id         uuid references usuario(id),
  usuario_ingresado  text not null,
  exito              boolean not null,
  motivo             text,                                 -- 'ok', 'contraseña incorrecta', 'usuario bloqueado'...
  ip                 text,
  user_agent         text,
  fecha              timestamptz not null default now()
);

create index on usuario (empresa_id);
create index on acceso (fecha desc);
create index on acceso (usuario_id);

alter table empresa enable row level security;
alter table usuario enable row level security;
alter table acceso  enable row level security;

revoke all on empresa, usuario, acceso from anon, authenticated;
