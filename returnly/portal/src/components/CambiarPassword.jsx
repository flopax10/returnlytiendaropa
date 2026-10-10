import { useRef, useState } from 'react'
import { api } from '../api.js'

// Botón + ventana para que cualquier usuario cambie su propia contraseña
export default function CambiarPassword() {
  const dialogo = useRef(null)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [mensaje, setMensaje] = useState(null)

  const abrir = () => {
    setActual(''); setNueva(''); setRepetida(''); setMensaje(null)
    dialogo.current.showModal()
  }
  const enviar = async (e) => {
    e.preventDefault()
    if (nueva !== repetida) return setMensaje({ error: true, texto: 'Las contraseñas nuevas no coinciden' })
    try {
      await api('/cambiar-password', { body: { actual, nueva } })
      setMensaje({ error: false, texto: 'Listo, tu contraseña se cambió.' })
      setActual(''); setNueva(''); setRepetida('')
    } catch (err) {
      setMensaje({ error: true, texto: err.message })
    }
  }

  return (
    <>
      <button className="boton-vista" onClick={abrir}>Cambiar contraseña</button>
      <dialog ref={dialogo} className="dialogo">
        <form className="formulario-admin" onSubmit={enviar}>
          <h2>Cambiar contraseña</h2>
          <label>Contraseña actual<input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required /></label>
          <label>Contraseña nueva (mínimo 10 caracteres)<input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" minLength={10} required /></label>
          <label>Repetí la nueva<input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" minLength={10} required /></label>
          {mensaje && <p className={mensaje.error ? 'error' : 'ok'} role="status">{mensaje.texto}</p>}
          <div className="acciones-formulario">
            <button type="button" className="boton-vista" onClick={() => dialogo.current.close()}>Cerrar</button>
            <button className="boton">Guardar</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
