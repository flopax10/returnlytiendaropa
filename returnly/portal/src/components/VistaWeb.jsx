// Miniaturas de "cómo se veía en la web" (copias del Internet Archive) con link a la página.
// Primero se busca la copia guardada más cercana al período; si no hay, se avisa. La captura la genera un
// servicio externo la primera vez (unos 30 segundos): mientras tanto devuelve una imagen genérica de 400 px
// de ancho, así que se reintenta cada pocos segundos hasta que llega la de verdad.
import { useEffect, useState } from 'react'
import { buscarCopia } from '../web.js'

function Miniatura({ item, empresaId }) {
  const [copia, setCopia] = useState(undefined) // undefined = buscando, null = no hay copia
  const [intento, setIntento] = useState(0)
  const [lista, setLista] = useState(false)

  useEffect(() => {
    buscarCopia(item, empresaId).then(setCopia).catch(() => setCopia(null))
  }, [item.url])

  const alCargar = (e) => {
    if (e.currentTarget.naturalWidth === 400 && intento < 10) setTimeout(() => setIntento((i) => i + 1), 6000)
    else setLista(true)
  }

  return (
    <figure className="web-item">
      {copia
        ? (
          <a href={copia.archivo} target="_blank" rel="noopener noreferrer" className="web-marco" title={`Abrir ${item.url} (${copia.fechaTexto})`}>
            <img
              src={`${copia.miniatura}&r=${intento}`}
              alt={`Cómo se veía "${item.etiqueta}" en la web en ${copia.fechaTexto}`}
              onLoad={alCargar}
              className={lista ? '' : 'web-cargando'}
            />
            {!lista && <span className="web-aviso">Generando la vista previa…</span>}
          </a>
        )
        : (
          <div className="web-marco">
            <span className="web-aviso">{copia === null ? 'No hay una copia guardada de esta página' : 'Buscando la página…'}</span>
          </div>
        )}
      <figcaption>
        <strong>{item.etiqueta}</strong>
        {copia && <a href={copia.archivo} target="_blank" rel="noopener noreferrer">Ver la página ({copia.fechaTexto}) ↗</a>}
      </figcaption>
    </figure>
  )
}

export default function VistaWeb({ items, empresaId }) {
  if (!items?.length) return null
  return (
    <div className="web">
      <p className="web-titulo">Cómo se veía en la web</p>
      <div className="web-grilla">
        {items.map((item) => <Miniatura key={item.url} item={item} empresaId={empresaId} />)}
      </div>
    </div>
  )
}
