import { useEffect, useState } from 'react'
import { api } from './api.js'
import { calcularMetricas } from './metricas.js'
import Ingresar from './pages/Ingresar.jsx'
import Panel from './pages/Panel.jsx'
import Admin from './pages/Admin.jsx'

// Flujo:
// - sin sesión -> pantalla de ingreso
// - cliente    -> dashboards de SU empresa
// - admin      -> pantalla Admin de seguridad (y puede abrir el panel de cualquier empresa)
export default function App() {
  const [sesion, setSesion] = useState(undefined) // undefined = verificando, null = sin sesión
  const [empresaVista, setEmpresaVista] = useState(null) // empresa cuyo panel se está mirando
  const [panel, setPanel] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/sesion').then(entrar).catch(() => setSesion(null))
  }, [])

  function entrar(s) {
    setSesion(s)
    setEmpresaVista(s.usuario.rol === 'cliente' ? s.empresa : null)
  }

  useEffect(() => {
    if (!empresaVista) return
    setPanel(null)
    setError('')
    const ruta = sesion.usuario.rol === 'admin' ? `/datos?empresa=${encodeURIComponent(empresaVista.id)}` : '/datos'
    api(ruta)
      .then((r) => setPanel({ empresa: r.empresa, actualizado: r.actualizado, metricas: calcularMetricas(r.datos) }))
      .catch((err) => (err.status === 401 ? setSesion(null) : setError(err.message)))
  }, [empresaVista])

  const salir = async () => {
    await api('/logout', { body: {} }).catch(() => {})
    setPanel(null)
    setEmpresaVista(null)
    setSesion(null)
  }
  const volverAlAdmin = sesion?.usuario.rol === 'admin' ? () => { setEmpresaVista(null); setPanel(null) } : null

  if (sesion === undefined) return null
  if (!sesion) return <Ingresar onIngreso={entrar} />
  if (!empresaVista) return <Admin usuario={sesion.usuario} onVerPanel={setEmpresaVista} onSalir={salir} />
  if (error) {
    return (
      <main className="ingreso">
        <div className="ingreso-tarjeta">
          <p className="error" role="alert">{error}</p>
          <button className="boton" onClick={volverAlAdmin ?? salir}>{volverAlAdmin ? 'Volver al admin' : 'Volver al ingreso'}</button>
        </div>
      </main>
    )
  }
  if (!panel) {
    return (
      <main className="ingreso">
        <p className="cargando">Cargando los datos de {empresaVista.nombre}…</p>
      </main>
    )
  }
  return <Panel empresa={panel.empresa} actualizado={panel.actualizado} metricas={panel.metricas} onSalir={salir} onVolver={volverAlAdmin} />
}
