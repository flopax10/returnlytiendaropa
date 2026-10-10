// Pasa la configuración vieja (empresas.json + KEY en .env) a Supabase. Se corre UNA vez:
//   npm run migrar
// - Crea las empresas con su KEY de Google encriptada.
// - Crea los usuarios cliente con las mismas contraseñas que tenían.
// - Crea el usuario "admin" con una contraseña nueva que se agrega como comentario al final de .env.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { db, q } from '../src/db.js';
import { guardarCredencial } from '../src/empresas.js';
import { hashPassword } from '../src/auth.js';
import { passwordTemporal } from '../src/admin.js';

const ARCHIVO = new URL('../empresas.json', import.meta.url);
if (!existsSync(ARCHIVO)) throw new Error('No está empresas.json: la migración ya se hizo');
const viejas = JSON.parse(readFileSync(ARCHIVO, 'utf8'));

for (const e of viejas) {
  const { tipo, credencial, ...config } = e.fuente;
  await q(db.from('empresa').upsert({ id: e.id, nombre: e.nombre, fuente_tipo: tipo, fuente_config: config, nota: e.nota }));
  const ruta = process.env[credencial];
  if (ruta) {
    const json = JSON.parse(ruta.trim().startsWith('{') ? ruta : readFileSync(ruta.trim(), 'utf8'));
    await guardarCredencial(e.id, json);
  }
  await q(db.from('usuario').upsert(
    { usuario: e.usuario, nombre: e.nombre, rol: 'cliente', empresa_id: e.id, password_hash: e.passwordHash },
    { onConflict: 'usuario' }));
  console.log(`Empresa "${e.nombre}" y usuario "${e.usuario}" migrados${ruta ? ' (con KEY encriptada)' : ' (SIN KEY)'}`);
}

const existeAdmin = (await q(db.from('usuario').select('id').eq('usuario', 'admin'))).length > 0;
if (!existeAdmin) {
  const password = passwordTemporal();
  await q(db.from('usuario').insert({ usuario: 'admin', nombre: 'Admin de Returnly', rol: 'admin', password_hash: hashPassword(password) }));
  appendFileSync(new URL('../.env', import.meta.url), `# Admin de Returnly -> usuario: admin / contraseña: ${password}\n`);
  console.log('Usuario "admin" creado. Su contraseña quedó anotada al final de .env');
}
