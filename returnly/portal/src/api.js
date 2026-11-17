// Llamadas al backend de Returnly. La sesión viaja en una cookie httpOnly que pone el backend.
// Si el backend dice que la sesión se cerró (401), se avisa a la app con el evento "returnly:sesion-cerrada".
export async function api(ruta, { body, method } = {}) {
  const res = await fetch(`/api${ruta}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body && JSON.stringify(body),
    credentials: 'same-origin',
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && ruta !== '/login' && ruta !== '/sesion') {
      window.dispatchEvent(new CustomEvent('returnly:sesion-cerrada', { detail: datos.inactividad ? datos.error : null }))
    }
    throw Object.assign(new Error(datos.error ?? 'No se pudo conectar con Returnly'), { status: res.status, inactividad: Boolean(datos.inactividad) })
  }
  return datos
}
