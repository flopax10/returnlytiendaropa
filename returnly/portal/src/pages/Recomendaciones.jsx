// Pantalla de Feedback: conclusiones "bajadas a tierra" para el negocio, cada una con por qué pasa y qué hacer.
import { useState } from 'react'
import { Tabla } from '../components/graficos.jsx'
import VistaWeb from '../components/VistaWeb.jsx'

function Recomendacion({ numero, r, empresa }) {
  const [verDatos, setVerDatos] = useState(false)
  return (
    <article className="recomendacion">
      <header className="recomendacion-cabezal">
        <span className="recomendacion-numero" aria-hidden="true">{numero}</span>
        <h2>{r.pregunta}</h2>
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
    </article>
  )
}

export default function Recomendaciones({ recomendaciones, empresa }) {
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
      {recomendaciones.map((r, i) => <Recomendacion key={r.id} numero={i + 1} r={r} empresa={empresa} />)}
    </>
  )
}
