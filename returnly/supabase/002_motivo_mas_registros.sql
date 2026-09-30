-- Más motivos de devolución; "Otro" pasa al final de la lista
update public.motivo set orden = 99 where categoria = 'Otro';
insert into public.motivo (categoria, subopciones, requiere_comentario, orden) values
  ('No me queda bien el calce', array['Muy ajustado','Muy suelto','Largo incorrecto'], false, 7),
  ('Llegó tarde', '{}', false, 8),
  ('Compré por error / pedido duplicado', '{}', false, 9),
  ('Encontré un precio mejor', '{}', false, 10)
on conflict (categoria) do nothing;
