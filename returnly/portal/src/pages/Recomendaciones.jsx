// Pantalla de Feedback: conclusiones "bajadas a tierra" para el negocio, cada una con por qué pasa y qué hacer.
// Arriba, si la IA está configurada, un resumen hecho a medida de la empresa; y en cada recomendación, la acción
// adaptada a su rubro. Si la IA no responde, se ve todo igual que antes (las reglas fijas).
import { useEffect, useState } from 'react'
import { Tabla } from '../components/graficos.jsx'
import VistaWeb from '../components/VistaWeb.jsx'
import { api } from '../api.js'

function Recomendacion({ numero, r, ia, prioridad, empresa }) {
  const [verDatos, setVerDatos] = useState(false)
  const [verOriginal, setVerOriginal] = useState(false)
  return (
    <article className="recomendacion">
      <header className="recomendacion-cabezal">
        <span className="recomendacion-numero" aria-hidden="true">{numero}</span>
        <h2>{r.pregunta}</h2>
        {prioridad && <span className="etiqueta-prioridad">Prioridad {prioridad}</span>}
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
        {ia ? (
          <>
            <dt>Qué hacer en tu negocio <span className="etiqueta-ia">✦ IA</span></dt>
            <dd className="recomendacion-accion">
              {ia.accion}
              {ia.porque && <span className="ia-porque">{ia.porque}</span>}
              <button className="boton-texto" onClick={() => setVerOriginal((v) => !v)} aria-expanded={verOriginal}>
                {verOriginal ? 'Ocultar la recomendación general' : 'Ver la recomendación general'}
              </button>
              {verOriginal && <span className="ia-original">{r.accion}</span>}
            </dd>
          </>
        ) : (
          <>
            <dt>Qué hacer</dt>
            <dd className="recomendacion-accion">{r.accion}</dd>
          </>
        )}
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
    </article>
  )
}

// Pide a la IA el feedback adaptado. Estado: cargando -> listo | error | sin IA (503: no está configurada)
function useFeedbackIA(recomendaciones, empresa) {
  const [estado, setEstado] = useState({ cargando: true })
  useEffect(() => {
    let vigente = true
    setEstado({ cargando: true })
    const textos = recomendaciones.map(({ id, pregunta, hallazgo, hipotesis, accion, impacto }) => ({ id, pregunta, hallazgo, hipotesis, accion, impacto }))
    api(`/feedback-ia?empresa=${encodeURIComponent(empresa.id)}`, { body: { recomendaciones: textos } })
      .then((ia) => vigente && setEstado({ ia }))
      .catch((e) => vigente && setEstado(e.status === 503 ? {} : { error: e.message }))
    return () => { vigente = false }
  }, [recomendaciones, empresa.id])
  return estado
}

function ResumenIA({ estado }) {
  if (estado.cargando) {
    return (
      <section className="tarjeta resumen-ia" aria-live="polite">
        <p className="etiqueta-ia">✦ IA</p>
        <p className="muted">Adaptando el feedback a tu negocio…</p>
      </section>
    )
  }
  if (estado.error) {
    return <p className="aviso">No pudimos adaptar el feedback con IA ({estado.error}). Abajo están las recomendaciones generales.</p>
  }
  if (!estado.ia?.resumen) return null
  return (
    <section className="tarjeta resumen-ia">
      <p className="etiqueta-ia">✦ Diagnóstico con IA</p>
      <p className="resumen-ia-texto">{estado.ia.resumen}</p>
      <p className="muted resumen-ia-pie">
        Generado con IA a partir de tus datos. Los números salen de tus datos; la IA solo los interpreta y adapta las
        acciones a tu negocio.
      </p>
    </section>
  )
}

export default function Recomendaciones({ recomendaciones, empresa }) {
  const estado = useFeedbackIA(recomendaciones, empresa)
  const ia = estado.ia
  // Con IA, primero van las 3 prioridades que eligió y después el resto en el orden de siempre
  const prioridades = ia?.prioridades ?? []
  const ordenadas = [
    ...prioridades.map((id) => recomendaciones.find((r) => r.id === id)).filter(Boolean),
    ...recomendaciones.filter((r) => !prioridades.includes(r.id)),
  ]
  return (
    <>
      <section className="tarjeta">
        <h2>Feedback para tu negocio</h2>
        <p className="subtitulo">
          Conclusiones sacadas del comportamiento de tus clientes antes de comprar. Cada una responde una pregunta del
          negocio, explica por qué puede estar pasando y propone una acción concreta. Los impactos son estimaciones para
          ayudarte a priorizar.
        </p>
      </section>
      <ResumenIA estado={estado} />
      {ordenadas.map((r, i) => {
        const p = prioridades.indexOf(r.id)
        return <Recomendacion key={r.id} numero={i + 1} r={r} ia={ia?.porId?.[r.id]} prioridad={p >= 0 ? p + 1 : null} empresa={empresa} />
      })}
    </>
  )
}
