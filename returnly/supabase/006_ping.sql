-- Función mínima para que la tarea diaria de GitHub (.github/workflows/mantener-supabase.yml) "toque" la base
-- y Supabase no pause el proyecto por inactividad. No lee ninguna tabla: solo devuelve la hora del servidor.
create or replace function public.ping()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon;
