// Detecta si se publicó una versión nueva de Returnly mientras la página estaba abierta.
// Returnly se carga una sola vez: entrar y salir no la vuelve a descargar. Por eso cada 2 minutos (y al volver
// a la pestaña) se compara el archivo principal publicado con el que está corriendo.
//  - Sin sesión (pantalla de ingreso): se recarga sola, sin preguntar.
//  - Con sesión: aparece un aviso con el botón "Actualizar", para no cortarle lo que está haciendo.
import { useEffect, useState } from 'react'

const CADA_MS = 2 * 60 * 1000
const scriptPrincipal = (doc) => doc.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null

export default function NuevaVersion({ conSesion }) {
  const [hayNueva, setHayNueva] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return // en desarrollo los archivos no tienen versión
    const actual = scriptPrincipal(document)
    if (!actual) return
    let vigente = true
    const revisar = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const publicado = scriptPrincipal(new DOMParser().parseFromString(html, 'text/html'))
        if (vigente && publicado && publicado !== actual) setHayNueva(true)
      } catch {
        // sin conexión: se vuelve a probar en la próxima vuelta
      }
    }
    const alVolver = () => document.visibilityState === 'visible' && revisar()
    const reloj = setInterval(revisar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', revisar)
    return () => {
      vigente = false
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', revisar)
    }
  }, [])

  useEffect(() => {
    if (hayNueva && !conSesion) window.location.reload()
  }, [hayNueva, conSesion])

  if (!hayNueva || !conSesion) return null
  return (
    <div className="aviso-version" role="status">
      <p><strong>Hay una versión nueva de Returnly.</strong> Actualizá para ver los últimos cambios.</p>
      <button className="boton" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  )
}
