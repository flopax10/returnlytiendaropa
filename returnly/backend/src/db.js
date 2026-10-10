// Conexión a Supabase con la clave SECRETA (solo en el servidor). Las tablas empresa, usuario y acceso
// tienen RLS sin políticas: con la clave publicable no se pueden leer; solo este backend accede.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY;
if (!url || !clave) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY. Mirá backend/.env.example');

export const db = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

// Devuelve data o tira el error de Supabase
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}
