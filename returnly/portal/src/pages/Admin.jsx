// Pantalla Admin de seguridad (solo para administradores de Returnly):
// empresas y sus KEY de Google, usuarios y registro de accesos.
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import CambiarPassword from '../components/CambiarPassword.jsx'

const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function Estado({ ok, si, no }) {
  return <span className={`estado ${ok ? 'estado-ok' : 'estado-mal'}`}><span aria-hidden="true">{ok ? '●' : '■'}</span> {ok ? si : no}</span>
}

// Botón que pide confirmación en la misma página: primer clic muestra "¿Seguro? Sí / No".
// (No se usa confirm() del navegador porque algunos navegadores lo bloquean sin avisar.)
function BotonConfirmar({ texto, pregunta, onConfirmar }) {
  const [preguntando, setPreguntando] = useState(false)
  if (!preguntando) return <button className="boton-vista" onClick={() => setPreguntando(true)}>{texto}</button>
  return (
    <span className="confirmar" role="group" aria-label={pregunta}>
      <span className="confirmar-pregunta">{pregunta}</span>
      <button className="boton-vista boton-si" onClick={() => { setPreguntando(false); onConfirmar() }}>Sí</button>
      <button className="boton-vista" onClick={() => setPreguntando(false)}>No</button>
    </span>
  )
}

// Contraseña temporal: se muestra una sola vez para pasársela a la persona
function AvisoPassword({ aviso, onCerrar }) {
  const [copiada, setCopiada] = useState(false)
  if (!aviso) return null
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(aviso.password)
      setCopiada(true)
    } catch {
      setCopiada(null) // el navegador no deja copiar: hay que seleccionarla a mano
    }
  }
  return (
    <div className="aviso aviso-password" role="status">
      <p>
        <strong>Contraseña temporal de "{aviso.usuario}":</strong> <code>{aviso.password}</code>{' '}
        <button className="boton-vista" onClick={copiar}>{copiada ? 'Copiada ✓' : 'Copiar'}</button>
      </p>
      {copiada === null && <p>Tu navegador no deja copiar automáticamente: seleccioná la contraseña con el mouse y copiala con Ctrl + C.</p>}
      <p>Copiala y pasásela por un medio seguro. <strong>No se va a volver a mostrar.</strong> La persona puede cambiarla desde "Cambiar contraseña".</p>
      <button className="boton-vista" onClick={() => { setCopiada(false); onCerrar() }}>Ya la copié</button>
    </div>
  )
}

export default function Admin({ usuario, onVerPanel, onSalir }) {
  const [pestana, setPestana] = useState('empresas')
  const [empresas, setEmpresas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [accesos, setAccesos] = useState([])
  const [fuentes, setFuentes] = useState([])
  const [mensaje, setMensaje] = useState(null)
  const [aviso, setAviso] = useState(null)

  const avisar = (texto, error = false) => setMensaje({ texto, error })
  const cargar = async () => {
    try {
      const [e, u, a, f] = await Promise.all([api('/admin/empresas'), api('/admin/usuarios'), api('/admin/accesos'), api('/admin/fuentes')])
      setEmpresas(e); setUsuarios(u); setAccesos(a); setFuentes(f)
    } catch (err) {
      avisar(err.message, true)
    }
  }
  useEffect(() => { cargar() }, [])

  const accion = async (fn, ok) => {
    setMensaje(null)
    try {
      const r = await fn()
      await cargar()
      if (ok) avisar(typeof ok === 'function' ? ok(r) : ok)
      return r
    } catch (err) {
      avisar(err.message, true)
    }
  }

  const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre ?? id

  return (
    <div className="panel">
      <header className="barra-superior">
        <div className="marca">
          <span className="logo">Returnly</span>
          <span className="marca-sub">Admin de seguridad</span>
        </div>
        <div className="filtros">
          <span className="empresa">{usuario.nombre}</span>
          <CambiarPassword />
          <button className="boton-vista" onClick={onSalir}>Salir</button>
        </div>
      </header>

      <main className="contenido">
        <nav className="pestanas" role="tablist">
          {[['empresas', 'Empresas'], ['usuarios', 'Usuarios'], ['accesos', 'Registro de accesos']].map(([id, texto]) => (
            <button key={id} role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>{texto}</button>
          ))}
        </nav>

        {mensaje && <p className={mensaje.error ? 'aviso aviso-error' : 'aviso aviso-ok'} role="status">{mensaje.texto}</p>}
        <AvisoPassword aviso={aviso} onCerrar={() => setAviso(null)} />

        {pestana === 'empresas' && (
          <Empresas empresas={empresas} fuentes={fuentes} accion={accion} onVerPanel={onVerPanel} />
        )}
        {pestana === 'usuarios' && (
          <Usuarios usuarios={usuarios} empresas={empresas} yo={usuario} accion={accion} setAviso={setAviso} nombreEmpresa={nombreEmpresa} />
        )}
        {pestana === 'accesos' && <Accesos accesos={accesos} nombreEmpresa={nombreEmpresa} onActualizar={cargar} />}
      </main>
    </div>
  )
}

// ---- Empresas ----

// Nombre de la empresa: si tiene web, es un link que abre la tienda en otra pestaña
function NombreEmpresa({ empresa }) {
  return (
    <>
      {empresa.web
        ? <a className="link-web" href={empresa.web} target="_blank" rel="noopener noreferrer" title={`Abrir ${empresa.web}`}><strong>{empresa.nombre}</strong> ↗</a>
        : <strong>{empresa.nombre}</strong>}
      <br />
      <span className="muted">{empresa.id}{empresa.web ? '' : ' · sin web'}</span>
    </>
  )
}

// Botón "Editar web": muestra un campo para cargar o cambiar la dirección de la tienda
function EditarWeb({ empresa, accion }) {
  const [editando, setEditando] = useState(false)
  const [web, setWeb] = useState(empresa.web ?? '')
  if (!editando) {
    return <button className="boton-vista" onClick={() => { setWeb(empresa.web ?? ''); setEditando(true) }}>{empresa.web ? 'Editar web' : 'Agregar web'}</button>
  }
  const guardar = async (e) => {
    e.preventDefault()
    const r = await accion(() => api(`/admin/empresas/${empresa.id}`, { body: { web }, method: 'PATCH' }),
      web.trim() ? `Web de "${empresa.nombre}" guardada.` : `Se quitó la web de "${empresa.nombre}".`)
    if (r) setEditando(false)
  }
  return (
    <form className="confirmar" onSubmit={guardar}>
      <input type="url" value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://mitienda.com" aria-label="Web de la tienda" autoFocus />
      <button className="boton-vista boton-guardar">Guardar</button>
      <button type="button" className="boton-vista" onClick={() => setEditando(false)}>Cancelar</button>
    </form>
  )
}

function Empresas({ empresas, fuentes, accion, onVerPanel }) {
  const [nueva, setNueva] = useState({ id: '', nombre: '', fuente_tipo: 'ga4', valor: '', nota: '', web: '' })
  const fuente = fuentes.find((f) => f.id === nueva.fuente_tipo)
  const campo = fuente?.campos[0]

  const crear = async (e) => {
    e.preventDefault()
    const r = await accion(() => api('/admin/empresas', {
      body: { id: nueva.id, nombre: nueva.nombre, fuente_tipo: nueva.fuente_tipo, fuente_config: { [campo.campo]: nueva.valor.trim() }, nota: nueva.nota, web: nueva.web },
    }), `Empresa "${nueva.nombre}" creada. Ahora cargale su KEY de Google.`)
    if (r) setNueva({ id: '', nombre: '', fuente_tipo: 'ga4', valor: '', nota: '', web: '' })
  }

  // Lee el .json elegido y lo manda al backend, que lo guarda encriptado y prueba la conexión
  const cargarKey = (empresa) => async (e) => {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    let json
    try {
      json = JSON.parse(await archivo.text())
    } catch {
      return accion(() => Promise.reject(new Error('El archivo no es un .json válido')))
    }
    accion(() => api(`/admin/empresas/${empresa.id}/credencial`, { body: json, method: 'PUT' }), (r) => (r.prueba.ok
      ? `KEY de "${empresa.nombre}" guardada (encriptada). Conexión OK: ${r.prueba.gbPorActualizacion} GB por actualización.`
      : `KEY de "${empresa.nombre}" guardada, pero la conexión falló: ${r.prueba.error}`))
  }

  const probar = (empresa) => accion(() => api(`/admin/empresas/${empresa.id}/probar`, { body: {} }), (r) => (r.ok
    ? `Conexión de "${empresa.nombre}" OK: ${r.gbPorActualizacion} GB por actualización.`
    : `La conexión de "${empresa.nombre}" falló: ${r.error}`))

  const cambiarEstado = (empresa) => {
    accion(() => api(`/admin/empresas/${empresa.id}`, { body: { activa: !empresa.activa }, method: 'PATCH' }),
      `"${empresa.nombre}" ${empresa.activa ? 'dada de baja' : 'reactivada'}.`)
  }

  return (
    <>
      <section className="tarjeta">
        <header className="tarjeta-cabezal"><div><h2>Empresas</h2><p className="subtitulo">Tiendas clientes de Returnly y la conexión a sus datos</p></div></header>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Empresa</th><th>Fuente</th><th>KEY de Google</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td><NombreEmpresa empresa={e} /></td>
                  <td>{fuentes.find((f) => f.id === e.fuente_tipo)?.nombre ?? e.fuente_tipo}<br /><span className="muted">{Object.values(e.fuente_config).join(', ')}</span></td>
                  <td>{e.tieneCredencial
                    ? <><Estado ok si="Cargada (encriptada)" /><br /><span className="muted correo">{e.credencial_email}</span></>
                    : <Estado no="Sin KEY cargada" />}</td>
                  <td><Estado ok={e.activa} si="Activa" no="Dada de baja" /></td>
                  <td className="acciones-fila">
                    <button className="boton-vista" onClick={() => onVerPanel(e)} disabled={!e.tieneCredencial}>Ver panel</button>
                    <label className="boton-vista">
                      {e.tieneCredencial ? 'Reemplazar KEY' : 'Cargar KEY'}
                      <input type="file" accept=".json,application/json" onChange={cargarKey(e)} hidden />
                    </label>
                    <button className="boton-vista" onClick={() => probar(e)} disabled={!e.tieneCredencial}>Probar conexión</button>
                    <EditarWeb empresa={e} accion={accion} />
                    {e.activa
                      ? <BotonConfirmar texto="Dar de baja" pregunta="¿Seguro? Sus usuarios no van a poder entrar." onConfirmar={() => cambiarEstado(e)} />
                      : <button className="boton-vista" onClick={() => cambiarEstado(e)}>Reactivar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta">
        <form className="formulario-admin" onSubmit={crear}>
          <h2>Nueva empresa</h2>
          <div className="campos">
            <label>Nombre<input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} required /></label>
            <label>Identificador<input value={nueva.id} onChange={(e) => setNueva({ ...nueva, id: e.target.value.toLowerCase() })} placeholder="mi-tienda" pattern="[a-z0-9-]{2,40}" required /></label>
            <label>Tipo de datos
              <select value={nueva.fuente_tipo} onChange={(e) => setNueva({ ...nueva, fuente_tipo: e.target.value, valor: '' })}>
                {fuentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </label>
            {campo && (
              <label>{campo.campo === 'tabla' ? 'Tabla de BigQuery' : 'Dataset de BigQuery'}
                <input value={nueva.valor} onChange={(e) => setNueva({ ...nueva, valor: e.target.value })} placeholder={campo.ejemplo} required />
              </label>
            )}
          </div>
          <label>Web de la tienda (opcional)<input type="url" value={nueva.web} onChange={(e) => setNueva({ ...nueva, web: e.target.value })} placeholder="https://mitienda.com" /></label>
          <label>Aviso para la empresa (opcional)<textarea rows={2} value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} /></label>
          <div className="acciones-formulario"><button className="boton">Crear empresa</button></div>
        </form>
      </section>
    </>
  )
}

// ---- Usuarios ----

function Usuarios({ usuarios, empresas, yo, accion, setAviso, nombreEmpresa }) {
  const vacio = { usuario: '', nombre: '', rol: 'cliente', empresa_id: '' }
  const [nuevo, setNuevo] = useState(vacio)

  const crear = async (e) => {
    e.preventDefault()
    const r = await accion(() => api('/admin/usuarios', { body: nuevo }), 'Usuario creado.')
    if (r) {
      setAviso({ usuario: r.usuario.usuario, password: r.passwordTemporal })
      setNuevo(vacio)
    }
  }
  const resetear = async (u) => {
    const r = await accion(() => api(`/admin/usuarios/${u.id}/resetear-password`, { body: {} }), 'Contraseña reseteada.')
    if (r) setAviso({ usuario: u.usuario, password: r.passwordTemporal })
  }
  const bloquear = (u) => accion(() => api(`/admin/usuarios/${u.id}`, { body: { activo: !u.activo }, method: 'PATCH' }),
    `"${u.usuario}" ${u.activo ? 'bloqueado: ya no puede entrar' : 'desbloqueado'}.`)

  return (
    <>
      <section className="tarjeta">
        <header className="tarjeta-cabezal"><div><h2>Usuarios</h2><p className="subtitulo">Admins de Returnly y usuarios de cada empresa</p></div></header>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Empresa</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.usuario}</strong><br /><span className="muted">{u.nombre}</span></td>
                  <td>{u.rol === 'admin' ? 'Admin' : 'Cliente'}</td>
                  <td>{u.empresa_id ? nombreEmpresa(u.empresa_id) : '—'}</td>
                  <td><Estado ok={u.activo} si="Activo" no="Bloqueado" /></td>
                  <td>{fecha(u.ultimo_acceso)}</td>
                  <td className="acciones-fila">
                    <BotonConfirmar texto="Resetear contraseña" pregunta="¿Seguro? La actual deja de funcionar." onConfirmar={() => resetear(u)} />
                    {u.id !== yo.id && <button className="boton-vista" onClick={() => bloquear(u)}>{u.activo ? 'Bloquear' : 'Desbloquear'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta">
        <form className="formulario-admin" onSubmit={crear}>
          <h2>Nuevo usuario</h2>
          <p className="subtitulo">Se le genera una contraseña temporal que vas a ver una sola vez.</p>
          <div className="campos">
            <label>Usuario<input value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value.toLowerCase() })} placeholder="nombre.apellido" pattern="[a-z0-9._-]{3,40}" required /></label>
            <label>Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required /></label>
            <label>Rol
              <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
                <option value="cliente">Cliente (ve los dashboards de su empresa)</option>
                <option value="admin">Admin de Returnly</option>
              </select>
            </label>
            {nuevo.rol === 'cliente' && (
              <label>Empresa
                <select value={nuevo.empresa_id} onChange={(e) => setNuevo({ ...nuevo, empresa_id: e.target.value })} required>
                  <option value="">Elegí…</option>
                  {empresas.filter((e) => e.activa).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="acciones-formulario"><button className="boton">Crear usuario</button></div>
        </form>
      </section>
    </>
  )
}

// ---- Registro de accesos ----

function navegador(ua = '') {
  const m = ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/[\d.]+/)
  const nombre = { Edg: 'Edge', OPR: 'Opera' }[m?.[1]] ?? m?.[1]
  return nombre ?? (ua.includes('curl') ? 'curl' : '—')
}

function Accesos({ accesos, nombreEmpresa, onActualizar }) {
  const fallidos = accesos.filter((a) => !a.exito).length
  return (
    <section className="tarjeta">
      <header className="tarjeta-cabezal">
        <div>
          <h2>Registro de accesos</h2>
          <p className="subtitulo">Últimos {accesos.length} intentos de ingreso · {fallidos} fallidos</p>
        </div>
        <button className="boton-vista" onClick={onActualizar}>Actualizar</button>
      </header>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Resultado</th><th>Motivo</th><th>IP</th><th>Navegador</th></tr></thead>
          <tbody>
            {accesos.map((a) => (
              <tr key={a.id}>
                <td className="num">{fecha(a.fecha)}</td>
                <td>{a.usuario_ingresado}{a.usuario?.empresa_id && <><br /><span className="muted">{nombreEmpresa(a.usuario.empresa_id)}</span></>}</td>
                <td><Estado ok={a.exito} si="Ingresó" no="Rechazado" /></td>
                <td>{a.motivo}</td>
                <td>{a.ip?.replace(/^::ffff:/, "")}</td>
                <td>{navegador(a.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
