// Empresas, usuarios y registro de accesos (tablas de Supabase). Lo que sale de acá hacia el navegador
// pasa por las funciones "publica..." para no mandar nunca contraseñas ni KEY.
import { db, q } from './db.js';
import { encriptar, desencriptar } from './cifrado.js';

// ---- Empresas ----

export const empresaPorId = async (id) => (await q(db.from('empresa').select('*').eq('id', id).limit(1)))[0];

// Con la fecha de la última actualización de sus datos (tabla datos_empresa), para el admin
export const listarEmpresas = () =>
  q(db.from('empresa').select('*, datos_empresa(actualizado, ultimo_intento, error)').order('creada_en'));

export async function crearEmpresa({ id, nombre, fuente_tipo, fuente_config, nota }) {
  return (await q(db.from('empresa').insert({ id, nombre, fuente_tipo, fuente_config, nota }).select()))[0];
}

export async function actualizarEmpresa(id, cambios) {
  return (await q(db.from('empresa').update(cambios).eq('id', id).select()))[0];
}

// Guarda la KEY de Google (el .json de la cuenta de servicio) encriptada
export async function guardarCredencial(id, json) {
  return actualizarEmpresa(id, { credencial_cifrada: encriptar(JSON.stringify(json)), credencial_email: json.client_email });
}

export function credencialDe(empresa) {
  if (!empresa.credencial_cifrada) throw new Error(`${empresa.nombre} no tiene cargada su KEY de Google`);
  return JSON.parse(desencriptar(empresa.credencial_cifrada));
}

// Lo que ven el admin y el panel (sin la KEY encriptada)
export const publicaEmpresa = ({ credencial_cifrada, ...resto }) => ({ ...resto, tieneCredencial: Boolean(credencial_cifrada) });

// ---- Usuarios ----

const COLUMNAS_USUARIO = 'id, usuario, nombre, rol, empresa_id, activo, creado_en, ultimo_acceso';

export const usuarioParaLogin = async (usuario) =>
  (await q(db.from('usuario').select('*').eq('usuario', String(usuario ?? '').trim().toLowerCase()).limit(1)))[0];

export const usuarioPorId = async (id) =>
  (await q(db.from('usuario').select(COLUMNAS_USUARIO).eq('id', id).limit(1)))[0];

export const listarUsuarios = () => q(db.from('usuario').select(COLUMNAS_USUARIO).order('creado_en'));

export async function crearUsuario({ usuario, nombre, rol, empresa_id, password_hash }) {
  return (await q(db.from('usuario')
    .insert({ usuario: usuario.trim().toLowerCase(), nombre, rol, empresa_id: rol === 'admin' ? null : empresa_id, password_hash })
    .select(COLUMNAS_USUARIO)))[0];
}

export async function actualizarUsuario(id, cambios) {
  return (await q(db.from('usuario').update(cambios).eq('id', id).select(COLUMNAS_USUARIO)))[0];
}

// ---- Accesos ----

export async function registrarAcceso({ usuario_id, usuario_ingresado, exito, motivo, ip, user_agent }) {
  await q(db.from('acceso').insert({ usuario_id, usuario_ingresado: String(usuario_ingresado ?? '').slice(0, 100), exito, motivo, ip, user_agent: user_agent?.slice(0, 300) }));
  if (exito && usuario_id) await q(db.from('usuario').update({ ultimo_acceso: new Date().toISOString() }).eq('id', usuario_id));
}

export const listarAccesos = (limite = 200) =>
  q(db.from('acceso').select('id, usuario_ingresado, exito, motivo, ip, user_agent, fecha, usuario(nombre, rol, empresa_id)')
    .order('fecha', { ascending: false }).limit(limite));
