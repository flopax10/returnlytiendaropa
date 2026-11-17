-- Limpieza (ya aplicada en Supabase):
--  - motivo: motivos de devolución, de cuando Returnly era un portal de devoluciones.
--  - feedback_ia: caché del feedback con IA, que al final no se agregó.
-- Ningún código las usaba y nada dependía de ellas.
drop table if exists motivo;
drop table if exists feedback_ia;
