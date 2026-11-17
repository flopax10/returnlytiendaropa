// Cierre de sesión por inactividad: tras los minutos sin uso que fija el backend (reglas) se cierra la sesión,
// y unos minutos antes aparece un aviso para seguir conectado. Mientras la persona usa la página
// (mueve el mouse, escribe, toca la pantalla), se le avisa al backend para que no cierre la sesión.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useReglas } from '../reglas.js'

const PING_MS = 60 * 1000 // como mucho un aviso al backend por minuto
const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']

export default function Inactividad({ onCerrar }) {
  const reglas = useReglas()
  const LIMITE_MS = (reglas?.minutosInactividad ?? 0) * 60 * 1000
  const AVISO_MS = (reglas?.minutosAvisoInactividad ?? 0) * 60 * 1000
  const ultimoUso = useRef(Date.now())
  const ultimoPing = useRef(Date.now())
  const [restante, setRestante] = useState(null) // ms que faltan, solo mientras se muestra el aviso

  useEffect(() => {
    if (!LIMITE_MS) return // sin reglas no hay reloj en pantalla (el backend igual cierra la sesión)
    const cerrarSiVencio = (err) => { if (err.inactividad || err.status === 401) onCerrar(err.message) }
    const usar = () => {
      // Si la compu estuvo suspendida o la pestaña quedó quieta más del límite, se cierra igual
      if (Date.now() - ultimoUso.current >= LIMITE_MS) return onCerrar('Tu sesión se cerró por inactividad. Volvé a ingresar.')
      ultimoUso.current = Date.now()
      if (Date.now() - ultimoPing.current > PING_MS) {
        ultimoPing.current = Date.now()
        api('/sesion').catch(cerrarSiVencio)
      }
    }
    EVENTOS.forEach((e) => window.addEventListener(e, usar, { passive: true }))
    const reloj = setInterval(() => {
      const falta = LIMITE_MS - (Date.now() - ultimoUso.current)
      if (falta <= 0) {
        clearInterval(reloj)
        onCerrar('Tu sesión se cerró por inactividad. Volvé a ingresar.')
      } else {
        setRestante(falta <= AVISO_MS ? falta : null)
      }
    }, 1000)
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, usar))
      clearInterval(reloj)
    }
  }, [onCerrar, LIMITE_MS, AVISO_MS])

  if (restante === null) return null
  const segundos = Math.ceil(restante / 1000)
  const texto = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
  return (
    <div className="aviso-inactividad" role="alertdialog" aria-live="assertive" aria-label="Aviso de inactividad">
      <p><strong>¿Seguís ahí?</strong> Por seguridad, tu sesión se va a cerrar en <strong>{texto}</strong> por inactividad.</p>
      <button className="boton" onClick={() => { ultimoUso.current = Date.now(); ultimoPing.current = Date.now(); setRestante(null); api('/sesion').catch(() => {}) }}>
        Seguir conectado
      </button>
    </div>
  )
}
