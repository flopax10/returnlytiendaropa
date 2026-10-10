// Login: contraseñas con scrypt y sesión en una cookie firmada con HMAC (sin dependencias).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { usuarioPorId } from './empresas.js';

const COOKIE = 'returnly_sesion';
const DURACION_MS = 8 * 3600 * 1000; // 8 horas

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

export function iniciarSesion(res, usuarioId) {
  const datos = Buffer.from(JSON.stringify({ uid: usuarioId, exp: Date.now() + DURACION_MS })).toString('base64url');
  res.cookie(COOKIE, `${datos}.${firmar(datos)}`, {
    httpOnly: true, // el JavaScript de la página no la puede leer
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DURACION_MS,
    path: '/',
  });
}

export function cerrarSesion(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function idDeLaCookie(req) {
  const [datos, firma] = (leerCookie(req) ?? '').split('.');
  if (!datos || !firma) return null;
  const esperada = Buffer.from(firmar(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  const { uid, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString());
  return exp > Date.now() ? uid : null;
}

// Middleware: exige sesión válida de un usuario ACTIVO (se revisa en la base en cada pedido, así un usuario
// bloqueado pierde el acceso al instante) y lo deja en req.usuario
export async function requiereSesion(req, res, next) {
  const uid = idDeLaCookie(req);
  const usuario = uid && await usuarioPorId(uid);
  if (!usuario?.activo) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  req.usuario = usuario;
  next();
}

export function requiereAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Solo para administradores de Returnly' });
  next();
}
