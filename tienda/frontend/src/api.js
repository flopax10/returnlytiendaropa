// Dónde está el backend. En la compu queda vacío y Vite redirige /api a localhost:3001;
// en Vercel es la URL del backend publicado.
const API_URL = import.meta.env.VITE_API_URL ?? '';

// Cliente mínimo para la API de la tienda
export async function api(path, { token, body, method } = {}) {
  const res = await fetch(`${API_URL}/api/store${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Error de conexión'), { status: res.status });
  return data;
}

export const precio = (n) =>
  new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(n);

export const RETURNLY_URL = import.meta.env.VITE_RETURNLY_URL ?? 'http://localhost:5174';

// Link al portal de devoluciones de Returnly con el pedido ya cargado
export const linkDevolucion = (numero, email) =>
  `${RETURNLY_URL}/?pedido=${encodeURIComponent(numero)}&email=${encodeURIComponent(email)}`;
