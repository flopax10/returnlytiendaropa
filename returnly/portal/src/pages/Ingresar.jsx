import { useState } from 'react'
import { api } from '../api.js'

export default function Ingresar({ onIngreso }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      onIngreso(await api('/login', { body: { usuario, password } }))
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <main className="ingreso">
      <form className="ingreso-tarjeta" onSubmit={enviar}>
        <span className="logo">Returnly</span>
        <h1>Ingresá a tu panel</h1>
        <p className="subtitulo">Análisis del comportamiento de tus clientes antes de comprar.</p>
        <label>
          Usuario
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </main>
  )
}
