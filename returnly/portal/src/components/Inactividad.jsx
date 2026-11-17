// Cierre de sesión por inactividad: a los 30 minutos sin usar la página se cierra la sesión.
// 2 minutos antes aparece un aviso para seguir conectado. Mientras la persona usa la página
// (mueve el mouse, escribe, toca la pantalla), se le avisa al backend para que no cierre la sesión.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

const LIMITE_MS = 30 * 60 * 1000
const AVISO_MS = 2 * 60 * 1000
const PING_MS = 60 * 1000 // como mucho un aviso al backend por minuto
const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']

export default function Inactividad({ onCerrar }) {
  const ultimoUso = useRef(Date.now())
  const ultimoPing = useRef(Date.now())
  const [restante, setRestante] = useState(null) // ms que faltan, solo mientras se muestra el aviso

  useEffect(() => {
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
  }, [onCerrar])

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
