// Llamadas al backend de Returnly. La sesión viaja en una cookie httpOnly que pone el backend.
export async function api(ruta, { body, method } = {}) {
  const res = await fetch(`/api${ruta}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body && JSON.stringify(body),
    credentials: 'same-origin',
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(datos.error ?? 'No se pudo conectar con Returnly'), { status: res.status })
  return datos
}
