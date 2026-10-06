// Lectura mínima de Supabase vía su API REST (sin dependencias)
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://zxwudwagkowbxaonzaoh.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_SI5xXO3npg39n1cJFf9n2A_qqZgzOae';

export async function supabase(tabla, query = 'select=*') {
  const res = await fetch(`${URL}/rest/v1/${tabla}?${query}`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error('No se pudo leer Supabase');
  return res.json();
}
