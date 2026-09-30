-- Returnly · primera tabla: catálogo de motivos de devolución (ver plan-prototipo.md, sección 3)
create table if not exists public.motivo (
  id               smallint generated always as identity primary key,
  categoria        text not null unique,
  subopciones      text[] not null default '{}',
  requiere_comentario boolean not null default false,
  orden            smallint not null default 0
);

insert into public.motivo (categoria, subopciones, requiere_comentario, orden) values
  ('Talle',                                 array['Chico','Grande'],                     false, 1),
  ('Calidad',                               array['Material','Costura','Se deterioró'],  false, 2),
  ('No coincide con la foto/descripción',   array['Color','Tela','Forma'],               false, 3),
  ('Producto dañado o defectuoso',          '{}',                                        false, 4),
  ('Llegó otro producto',                   '{}',                                        false, 5),
  ('Cambié de opinión',                     '{}',                                        false, 6),
  ('Otro',                                  '{}',                                        true,  7)
on conflict (categoria) do nothing;

-- Lectura pública (el portal del cliente lista los motivos); escritura solo con service role
alter table public.motivo enable row level security;
create policy "motivos visibles para todos" on public.motivo for select using (true);
