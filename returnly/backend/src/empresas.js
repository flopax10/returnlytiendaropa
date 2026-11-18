// Empresas, usuarios y registro de accesos (tablas de Supabase). Lo que sale de acá hacia el navegador
// pasa por las funciones "publica..." para no mandar nunca contraseñas ni KEY.
import { db, q } from './db.js';
import { REGLAS } from './reglas.js';
import { encriptar, desencriptar } from './cifrado.js';

// ---- Empresas ----

export const empresaPorId = async (id) => (await q(db.from('empresa').select('*').eq('id', id).limit(1)))[0];

export const listarEmpresas = () => q(db.from('empresa').select('*').order('creada_en'));

export async function crearEmpresa({ id, nombre, fuente_tipo, fuente_config, nota, web }) {
  return (await q(db.from('empresa').insert({ id, nombre, fuente_tipo, fuente_config, nota, web }).select()))[0];
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

const COLUMNAS_USUARIO = 'id, usuario, nombre, rol, empresa_id, activo, creado_en, ultimo_acceso, intentos_fallidos, bloqueado_por_intentos, bloqueado_hasta';

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

// ---- Bloqueo por intentos fallidos ----

export const MAX_INTENTOS = REGLAS.maxIntentos;
export const MINUTOS_BLOQUEO_ADMIN = REGLAS.minutosBloqueoAdmin;

export const bloqueoTemporalVigente = (usuario) =>
  Boolean(usuario?.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date());

// Suma un intento fallido. Al llegar a MAX_INTENTOS bloquea: al cliente hasta que un admin lo desbloquee,
// al admin por MINUTOS_BLOQUEO_ADMIN (para que nadie pueda dejar a Returnly sin administradores).
// Devuelve { intentos, bloqueo } con bloqueo = 'cliente' | 'admin' si este intento produjo el bloqueo, o null.
export async function sumarIntentoFallido(usuario) {
  const intentos = (usuario.intentos_fallidos ?? 0) + 1;
  if (intentos < MAX_INTENTOS) {
    await actualizarUsuario(usuario.id, { intentos_fallidos: intentos });
    return { intentos, bloqueo: null };
  }
  if (usuario.rol === 'admin') {
    const hasta = new Date(Date.now() + MINUTOS_BLOQUEO_ADMIN * 60 * 1000).toISOString();
    await actualizarUsuario(usuario.id, { intentos_fallidos: 0, bloqueado_hasta: hasta });
    return { intentos, bloqueo: 'admin', hasta };
  }
  await actualizarUsuario(usuario.id, { intentos_fallidos: 0, activo: false, bloqueado_por_intentos: true });
  return { intentos, bloqueo: 'cliente' };
}

// Al entrar bien (o al desbloquear desde el admin) se limpia el contador
export const limpiarIntentos = (id) =>
  actualizarUsuario(id, { intentos_fallidos: 0, bloqueado_por_intentos: false, bloqueado_hasta: null });

// ---- Accesos ----

export async function registrarAcceso({ usuario_id, usuario_ingresado, exito, motivo, ip, user_agent }) {
  await q(db.from('acceso').insert({ usuario_id, usuario_ingresado: String(usuario_ingresado ?? '').slice(0, 100), exito, motivo, ip, user_agent: user_agent?.slice(0, 300) }));
  if (exito && usuario_id) await q(db.from('usuario').update({ ultimo_acceso: new Date().toISOString() }).eq('id', usuario_id));
}

export const listarAccesos = (limite = 200) =>
  q(db.from('acceso').select('id, usuario_ingresado, exito, motivo, ip, user_agent, fecha, usuario(nombre, rol, empresa_id)')
    .order('fecha', { ascending: false }).limit(limite));

// ---- Auditoría: quién hizo qué cambio y cuándo ----
// actor = el usuario que hizo la acción (null = el sistema, por ejemplo un bloqueo automático).
// Si falla el registro no se corta la acción: solo se avisa en el log del servidor.
export async function registrarAuditoria({ actor, accion, objetivo_tipo, objetivo_id, objetivo_nombre, detalle, ip }) {
  try {
    await q(db.from('auditoria').insert({
      actor_id: actor?.id ?? null,
      actor_usuario: actor?.usuario ?? 'sistema',
      accion,
      objetivo_tipo,
      objetivo_id: objetivo_id == null ? null : String(objetivo_id),
      objetivo_nombre: objetivo_nombre ?? null,
      detalle: detalle ? String(detalle).slice(0, 500) : null,
      ip: ip ?? null,
    }));
  } catch (e) {
    console.error('Auditoría', e.message);
  }
}

export const listarAuditoria = (limite = 1000) =>
  q(db.from('auditoria').select('id, fecha, actor_usuario, accion, objetivo_tipo, objetivo_id, objetivo_nombre, detalle, ip')
    .order('fecha', { ascending: false }).limit(limite));

// ---- Seguimiento de recomendaciones: estado (pendiente / en curso / hecha) y voto (👍 1 / 👎 -1) ----
// Es por empresa: lo que marca un usuario de la empresa lo ven todos los de esa empresa.
const COLUMNAS_SEGUIMIENTO = 'recomendacion_id, estado, voto, actualizado_en';

export const seguimientoDe = (empresaId) =>
  q(db.from('seguimiento').select(COLUMNAS_SEGUIMIENTO).eq('empresa_id', empresaId));

export async function guardarSeguimiento(empresaId, recomendacionId, cambios, usuarioId) {
  return (await q(db.from('seguimiento')
    .upsert({ empresa_id: empresaId, recomendacion_id: recomendacionId, ...cambios, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId },
      { onConflict: 'empresa_id,recomendacion_id' })
    .select(COLUMNAS_SEGUIMIENTO)))[0];
}

// Para el admin: cuántas recomendaciones marcó cada empresa en cada estado y cuántos 👍 / 👎 dio
export async function resumenSeguimiento() {
  const filas = await q(db.from('seguimiento').select('empresa_id, estado, voto'));
  const resumen = {};
  for (const f of filas) {
    const r = (resumen[f.empresa_id] ??= { en_curso: 0, hecha: 0, positivos: 0, negativos: 0 });
    if (f.estado === 'en_curso') r.en_curso += 1;
    if (f.estado === 'hecha') r.hecha += 1;
    if (f.voto === 1) r.positivos += 1;
    if (f.voto === -1) r.negativos += 1;
  }
  return resumen;
}

// ---- Estado de la base (para /api/health): una consulta mínima, sin traer datos ----
export const baseResponde = () => q(db.from('empresa').select('id', { head: true, count: 'exact' }).limit(1));
