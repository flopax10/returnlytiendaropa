// Autenticación mínima: contraseñas con scrypt y token firmado con HMAC (sin dependencias).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const SECRETO = process.env.SESSION_SECRET ?? 'secreto-demo-tienda';

export function hashPassword(password) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(password, sal, 32).toString('hex')}`;
}

export function verificarPassword(password, guardado) {
  const [sal, hash] = guardado.split(':');
  const calculado = scryptSync(password, sal, 32);
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}

const firmar = (datos) => createHmac('sha256', SECRETO).update(datos).digest('base64url');

export function crearToken(clienteId) {
  const datos = Buffer.from(JSON.stringify({ id: clienteId, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url');
  return `${datos}.${firmar(datos)}`;
}

// Middleware: exige "Authorization: Bearer <token>" y deja el id en req.clienteId
export function requiereLogin(req, res, next) {
  const [datos, firma] = (req.get('authorization') ?? '').replace(/^Bearer /, '').split('.');
  if (datos && firma && firmar(datos) === firma) {
    const { id, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString());
    if (exp > Date.now()) {
      req.clienteId = id;
      return next();
    }
  }
  res.status(401).json({ error: 'Tenés que iniciar sesión' });
}
