-- Bloqueo por intentos fallidos: a los 5 intentos seguidos con contraseña incorrecta,
--  - un usuario de empresa (cliente) queda bloqueado hasta que un admin lo desbloquee;
--  - un admin queda bloqueado 15 minutos (así nadie puede dejar a Returnly sin administradores).
alter table usuario
  add column intentos_fallidos smallint not null default 0,
  add column bloqueado_por_intentos boolean not null default false,
  add column bloqueado_hasta timestamptz;
