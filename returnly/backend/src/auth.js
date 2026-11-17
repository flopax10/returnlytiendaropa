// Login: contraseñas con scrypt y sesión en una cookie firmada con HMAC (sin dependencias).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { REGLAS } from './reglas.js';
import { usuarioPorId } from './empresas.js';

const COOKIE = 'returnly_sesion';
const DURACION_MS = REGLAS.horasSesion * 3600 * 1000; // duración máxima, aunque se use todo el tiempo
export const INACTIVIDAD_MS = REGLAS.minutosInactividad * 60 * 1000; // y se cierra tras ese tiempo sin uso

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('Falta SESSION_SECRET (mínimo 32 caracteres). Mirá backend/.env.example');
  return s;
}

export function hashPassword(password) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(password, sal, 32).toString('hex')}`;
}

export function verificarPassword(password, guardado) {
  const [sal, hash] = (guardado ?? '').split(':');
  if (!sal || !hash) return false;
  return timingSafeEqual(scryptSync(password, sal, 32), Buffer.from(hash, 'hex'));
}

const firmar = (datos) => createHmac('sha256', secreto()).update(datos).digest('base64url');

function leerCookie(req) {
  const par = (req.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return par?.slice(COOKIE.length + 1);
}

// La cookie guarda: uid (usuario), exp (vencimiento máximo) y act (último uso). Va firmada: no se puede alterar.
function escribirCookie(res, sesion) {
  const datos = Buffer.from(JSON.stringify(sesion)).toString('base64url');
  res.cookie(COOKIE, `${datos}.${firmar(datos)}`, {
    httpOnly: true, // el JavaScript de la página no la puede leer
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.max(0, sesion.exp - Date.now()),
    path: '/',
  });
}

export function iniciarSesion(res, usuarioId) {
  escribirCookie(res, { uid: usuarioId, exp: Date.now() + DURACION_MS, act: Date.now() });
}

export function cerrarSesion(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Devuelve la sesión de la cookie si la firma es válida, o null
function sesionDeLaCookie(req) {
  const [datos, firma] = (leerCookie(req) ?? '').split('.');
  if (!datos || !firma) return null;
  const esperada = Buffer.from(firmar(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    return JSON.parse(Buffer.from(datos, 'base64url').toString());
  } catch {
    return null;
  }
}

// Middleware: exige sesión válida de un usuario ACTIVO (se revisa en la base en cada pedido, así un usuario
// bloqueado pierde el acceso al instante) y lo deja en req.usuario.
// Si pasaron más de 30 minutos sin usar el sistema, cierra la sesión. Si no, renueva el "último uso".
export async function requiereSesion(req, res, next) {
  const sesion = sesionDeLaCookie(req);
  const ahora = Date.now();
  if (!sesion || !(sesion.exp > ahora)) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  if (!(ahora - (sesion.act ?? 0) < INACTIVIDAD_MS)) {
    cerrarSesion(res);
    return res.status(401).json({ error: 'Tu sesión se cerró por inactividad. Volvé a ingresar.', inactividad: true });
  }
  const usuario = await usuarioPorId(sesion.uid);
  if (!usuario?.activo) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  escribirCookie(res, { ...sesion, act: ahora });
  req.usuario = usuario;
  next();
}

export function requiereAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Solo para administradores de Returnly' });
  next();
}
