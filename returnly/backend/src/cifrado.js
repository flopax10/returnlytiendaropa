// Encriptación de las KEY de Google de las empresas (AES-256-GCM). La clave para encriptar está solo en el
// servidor (CREDENCIALES_KEY); en Supabase se guarda el texto encriptado, que sin esa clave no sirve.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function clave() {
  const hex = process.env.CREDENCIALES_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('CREDENCIALES_KEY tiene que ser 64 caracteres hex (32 bytes)');
  return Buffer.from(hex, 'hex');
}

// Formato guardado: iv.tag.datos (base64url)
export function encriptar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64url')).join('.');
}

export function desencriptar(guardado) {
  const [iv, tag, datos] = guardado.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}
