// Pantalla de Feedback: conclusiones "bajadas a tierra" para el negocio, cada una con por qué pasa y qué hacer.
// La empresa marca cada recomendación como pendiente / en curso / hecha y la vota 👍 / 👎 (se guarda en Supabase).
// El admin de Returnly lo ve igual, pero solo lectura.
import { useEffect, useState } from 'react'
import { Tabla } from '../components/graficos.jsx'
import VistaWeb from '../components/VistaWeb.jsx'
import { api } from '../api.js'
import { useReglas } from '../reglas.js'

// Cómo se muestra cada estado (los estados válidos los define el backend)
const NOMBRE_ESTADO = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' }

// Estado y voto de una recomendación
function Seguimiento({ seg, soloLectura, onCambiar }) {
  const estados = useReglas()?.estadosSeguimiento ?? []
  const estado = seg?.estado ?? 'pendiente'
  const voto = seg?.voto ?? null
  return (
    <footer className="seguimiento">
      <div className="seguimiento-grupo">
        <span className="seguimiento-etiqueta">{soloLectura ? 'Estado (lo marca la empresa)' : 'Tu avance'}</span>
        <div className="segmentado" role="group" aria-label="Estado de la recomendación">
          {estados.map((id) => (
            <button key={id} type="button" className={`segmento segmento-${id}`} aria-pressed={estado === id}
              disabled={soloLectura} onClick={() => estado !== id && onCambiar({ estado: id })}>
              {NOMBRE_ESTADO[id] ?? id}
            </button>
          ))}
        </div>
      </div>
      <div className="seguimiento-grupo">
        <span className="seguimiento-etiqueta">¿Te sirvió?</span>
        <div className="votos" role="group" aria-label="¿Te sirvió esta recomendación?">
          <button type="button" className="voto voto-si" aria-pressed={voto === 1} aria-label="Me sirvió" title="Me sirvió"
            disabled={soloLectura} onClick={() => onCambiar({ voto: voto === 1 ? null : 1 })}>👍</button>
          <button type="button" className="voto voto-no" aria-pressed={voto === -1} aria-label="No me sirvió" title="No me sirvió"
            disabled={soloLectura} onClick={() => onCambiar({ voto: voto === -1 ? null : -1 })}>👎</button>
        </div>
      </div>
    </footer>
  )
}

function Recomendacion({ numero, r, empresa, seg, soloLectura, onCambiar }) {
  const [verDatos, setVerDatos] = useState(false)
  const hecha = seg?.estado === 'hecha'
  return (
    <article className={`recomendacion${hecha ? ' recomendacion-hecha' : ''}`}>
      <header className="recomendacion-cabezal">
        <span className="recomendacion-numero" aria-hidden="true">{hecha ? '✓' : numero}</span>
        <h2>{r.pregunta}</h2>
        {seg?.estado === 'en_curso' && <span className="etiqueta-estado etiqueta-en-curso">En curso</span>}
        {hecha && <span className="etiqueta-estado etiqueta-hecha">Hecha</span>}
      </header>
      <dl className="recomendacion-cuerpo">
        <dt>Lo que encontramos</dt>
        <dd>{r.hallazgo}</dd>
        {r.hipotesis && (
          <>
            <dt>Por qué puede pasar</dt>
            <dd>{r.hipotesis}</dd>
          </>
        )}
        <dt>Qué hacer</dt>
        <dd className="recomendacion-accion">{r.accion}</dd>
        {r.impacto && (
          <>
            <dt>Impacto estimado</dt>
            <dd>{r.impacto} <span className="muted">(estimación sobre el período analizado)</span></dd>
          </>
        )}
      </dl>
      <VistaWeb items={r.web} empresaId={empresa.id} />
      {r.evidencia && (
        <>
          <button className="boton-vista" onClick={() => setVerDatos((v) => !v)} aria-expanded={verDatos}>
            {verDatos ? 'Ocultar los datos' : 'Ver los datos que lo respaldan'}
          </button>
          {verDatos && (
            <div className="recomendacion-evidencia">
              <p className="subtitulo">{r.evidencia.titulo}</p>
              <Tabla columnas={r.evidencia.columnas} filas={r.evidencia.filas} />
            </div>
          )}
        </>
      )}
      <Seguimiento seg={seg} soloLectura={soloLectura} onCambiar={onCambiar} />
    </article>
  )
}

export default function Recomendaciones({ recomendaciones, empresa, soloLectura = false }) {
  const [seguimiento, setSeguimiento] = useState({}) // { [recomendacion_id]: { estado, voto } }
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/seguimiento?empresa=${encodeURIComponent(empresa.id)}`)
      .then((filas) => setSeguimiento(Object.fromEntries(filas.map((f) => [f.recomendacion_id, f]))))
      .catch(() => {})
  }, [empresa.id])

  // Se muestra el cambio al instante y se guarda; si falla, se vuelve atrás y se avisa
  const cambiar = (id) => async (cambios) => {
    const antes = seguimiento[id]
    setError('')
    setSeguimiento((s) => ({ ...s, [id]: { ...s[id], ...cambios } }))
    try {
      const guardado = await api(`/seguimiento/${encodeURIComponent(id)}`, { body: cambios, method: 'PUT' })
      setSeguimiento((s) => ({ ...s, [id]: guardado }))
    } catch (e) {
      setSeguimiento((s) => ({ ...s, [id]: antes }))
      setError(`No se pudo guardar: ${e.message}`)
    }
  }

  const total = recomendaciones.length
  const cuenta = (estado) => recomendaciones.filter((r) => (seguimiento[r.id]?.estado ?? 'pendiente') === estado).length
  const hechas = cuenta('hecha')
  const enCurso = cuenta('en_curso')

  return (
    <>
      <section className="tarjeta">
        <h2>Feedback para tu negocio</h2>
        <p className="subtitulo">
          Conclusiones sacadas del comportamiento de tus clientes antes de comprar. Cada una responde una pregunta del
          negocio, explica por qué puede estar pasando y propone una acción concreta. Los impactos son estimaciones para
          ayudarte a priorizar.
        </p>
        <div className="avance" aria-label="Avance de las recomendaciones">
          <div className="avance-texto">
            <strong>{soloLectura ? 'Avance de la empresa' : 'Tu avance'}: {hechas} de {total} hechas</strong>
            {enCurso > 0 && <span className="muted"> · {enCurso} en curso</span>}
          </div>
          <div className="avance-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas}>
            <span className="avance-hechas" style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} />
            <span className="avance-curso" style={{ width: `${total ? (enCurso / total) * 100 : 0}%` }} />
          </div>
          {!soloLectura && <p className="muted avance-ayuda">Marcá cada recomendación a medida que la vas aplicando, y contanos con 👍 o 👎 si te sirvió.</p>}
        </div>
      </section>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      {recomendaciones.map((r, i) => (
        <Recomendacion key={r.id} numero={i + 1} r={r} empresa={empresa}
          seg={seguimiento[r.id]} soloLectura={soloLectura} onCambiar={cambiar(r.id)} />
      ))}
    </>
  )
}
