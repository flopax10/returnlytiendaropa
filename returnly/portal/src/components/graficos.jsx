// Gráficos del panel, dibujados en SVG/HTML sin librerías.
// Reglas: un solo color de datos (azul) por gráfico, líneas de 2px, barras de <=24px con punta redondeada,
// grilla en línea fina, tooltip al pasar el mouse o con el teclado, y cada gráfico tiene su vista de tabla.
import { useEffect, useRef, useState } from 'react'
import { fechaCorta } from '../metricas.js'

// Ancho real del contenedor, para dibujar el SVG a su tamaño (sin estirar el texto)
function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setAncho(e.contentRect.width))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, ancho]
}

// Máximo "redondo" para el eje y sus 4 marcas (0, 1.000, 2.000...)
function escala(max) {
  const paso0 = max / 4 || 1
  const mag = 10 ** Math.floor(Math.log10(paso0))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0)
  return { max: paso * 4, marcas: [0, 1, 2, 3, 4].map((i) => i * paso) }
}

function Tooltip({ pos, children }) {
  if (!pos) return null
  return (
    <div className="tooltip" style={{ left: pos.x, top: pos.y }} role="status">
      {children}
    </div>
  )
}

// ---- Tarjeta: título + gráfico, con botón para ver los mismos datos como tabla ----
export function Tarjeta({ titulo, subtitulo, tabla, ancho = 1, children }) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <section className={`tarjeta ${ancho === 2 ? 'ancho-2' : ''}`}>
      <header className="tarjeta-cabezal">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        </div>
        {tabla && (
          <button className="boton-vista" onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        )}
      </header>
      {verTabla ? <Tabla {...tabla} /> : children}
    </section>
  )
}

// ---- Tabla ----
export function Tabla({ columnas, filas }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead>
          <tr>{columnas.map((c) => <th key={c.titulo} className={c.numero ? 'num' : ''}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((c) => (
                <td key={c.titulo} className={c.numero ? 'num' : ''}>{c.formato ? c.formato(f[c.campo]) : f[c.campo]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Indicador (stat tile) ----
export function Indicador({ etiqueta, valor, detalle, destacado }) {
  return (
    <div className={`indicador ${destacado ? 'destacado' : ''}`}>
      <span className="indicador-etiqueta">{etiqueta}</span>
      <span className="indicador-valor">{valor}</span>
      {detalle && <span className="indicador-detalle">{detalle}</span>}
    </div>
  )
}

// ---- Línea de tiempo (una serie) con línea vertical que sigue al mouse ----
export function LineaTiempo({ datos, formato, alto = 180 }) {
  const [ref, ancho] = useAncho()
  const [i, setI] = useState(null)
  const { max, marcas } = escala(Math.max(...datos.map((d) => d.valor)))
  // El margen izquierdo se adapta al número más largo del eje (~6,5px por carácter a 11px)
  const m = { izq: 14 + Math.max(...marcas.map((v) => formato(v).length)) * 6.5, der: 14, arr: 10, aba: 26 }
  const w = Math.max(ancho - m.izq - m.der, 10)
  const h = alto - m.arr - m.aba
  const x = (k) => m.izq + (k / (datos.length - 1)) * w
  const y = (v) => m.arr + h - (v / max) * h
  const linea = datos.map((d, k) => `${k ? 'L' : 'M'}${x(k)},${y(d.valor)}`).join('')
  const area = `${linea}L${x(datos.length - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const meses = datos.map((d, k) => [d, k]).filter(([d]) => d.fecha.getDate() === 1)
  const ultimo = datos.length - 1

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = Math.round(((e.clientX - r.left - m.izq) / w) * ultimo)
    setI(Math.min(Math.max(k, 0), ultimo))
  }
  const teclado = (e) => {
    if (e.key === 'ArrowRight') setI((k) => Math.min((k ?? -1) + 1, ultimo))
    if (e.key === 'ArrowLeft') setI((k) => Math.max((k ?? ultimo + 1) - 1, 0))
  }

  return (
    <div ref={ref} className="grafico">
      {ancho > 0 && (
        <svg width={ancho} height={alto} onPointerMove={mover} onPointerLeave={() => setI(null)}
          tabIndex={0} onKeyDown={teclado} onBlur={() => setI(null)}
          aria-label="Gráfico de línea; usá las flechas para recorrer los días">
          {marcas.map((v) => (
            <g key={v}>
              <line x1={m.izq} x2={m.izq + w} y1={y(v)} y2={y(v)} className={v ? 'grilla' : 'eje'} />
              <text x={m.izq - 8} y={y(v)} className="texto-eje" textAnchor="end" dominantBaseline="middle">{formato(v)}</text>
            </g>
          ))}
          {meses.map(([d, k]) => (
            <text key={k} x={x(k)} y={alto - 6} className="texto-eje" textAnchor={k === 0 ? 'start' : 'middle'}>
              {d.fecha.toLocaleDateString('es-UY', { month: 'short' })}
            </text>
          ))}
          <path d={area} className="serie-area" />
          <path d={linea} className="serie-linea" />
          <circle cx={x(ultimo)} cy={y(datos[ultimo].valor)} r={4} className="serie-punto" />
          {i !== null && (
            <>
              <line x1={x(i)} x2={x(i)} y1={m.arr} y2={m.arr + h} className="cursor" />
              <circle cx={x(i)} cy={y(datos[i].valor)} r={4} className="serie-punto" />
            </>
          )}
        </svg>
      )}
      <Tooltip pos={i !== null && { x: x(i), y: y(datos[i].valor) }}>
        {i !== null && (
          <>
            <strong>{formato(datos[i].valor)}</strong>
            <span>{fechaCorta(datos[i].fecha)}</span>
          </>
        )}
      </Tooltip>
    </div>
  )
}

// ---- Barras horizontales (una serie), valor en la punta ----
export function Barras({ filas, formato, textoValor }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...filas.map((f) => f.valor))
  return (
    <div className="barras grafico" onPointerLeave={() => setHover(null)}>
      {filas.map((f, k) => (
        <div key={f.etiqueta} className={`barra-fila ${hover?.k === k ? 'activa' : ''}`} tabIndex={0}
          onPointerMove={(e) => {
            const r = e.currentTarget.parentElement.getBoundingClientRect()
            setHover({ k, x: e.clientX - r.left, y: e.clientY - r.top })
          }}
          onFocus={(e) => setHover({ k, x: e.currentTarget.offsetLeft + 160, y: e.currentTarget.offsetTop })}
          onBlur={() => setHover(null)}>
          <span className="barra-etiqueta" title={f.etiqueta}>{f.etiqueta}</span>
          <span className="barra-pista">
            {/* La barra más larga deja lugar para el valor en su punta */}
            <span className="barra" style={{ width: `calc((100% - 110px) * ${f.valor / max})` }} />
            <span className="barra-valor">{textoValor ? textoValor(f) : formato(f.valor)}</span>
          </span>
        </div>
      ))}
      <Tooltip pos={hover}>
        {hover && (
          <>
            <strong>{formato(filas[hover.k].valor)}</strong>
            <span>{filas[hover.k].etiqueta}</span>
            {filas[hover.k].detalle && <span>{filas[hover.k].detalle}</span>}
          </>
        )}
      </Tooltip>
    </div>
  )
}

// ---- Mapa de calor día x hora (escala de un solo color, más oscuro = más) ----
export function MapaCalor({ grilla, filas, formato }) {
  const [hover, setHover] = useState(null)
  const valores = grilla.flat()
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const PASOS = 7
  const nivel = (v) => Math.min(PASOS - 1, Math.floor(((v - min) / (max - min || 1)) * PASOS))

  return (
    <div className="calor grafico" onPointerLeave={() => setHover(null)}>
      <div className="calor-grilla">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="texto-eje calor-hora">{h % 3 === 0 ? h : ''}</span>
        ))}
        {grilla.map((fila, d) => (
          <FilaCalor key={d} nombre={filas[d]} fila={fila} d={d} nivel={nivel} setHover={setHover} hover={hover} />
        ))}
      </div>
      <div className="calor-leyenda texto-eje">
        <span>Menos</span>
        {Array.from({ length: PASOS }, (_, k) => <span key={k} className={`celda nivel-${k}`} />)}
        <span>Más</span>
      </div>
      <Tooltip pos={hover}>
        {hover && (
          <>
            <strong>{formato(grilla[hover.d][hover.h])} sesiones</strong>
            <span>{filas[hover.d]} · {hover.h}:00 a {hover.h}:59 (UTC)</span>
          </>
        )}
      </Tooltip>
    </div>
  )
}

function FilaCalor({ nombre, fila, d, nivel, setHover, hover }) {
  return (
    <>
      <span className="texto-eje calor-dia">{nombre}</span>
      {fila.map((v, h) => (
        <span key={h} tabIndex={0}
          className={`celda nivel-${nivel(v)} ${hover?.d === d && hover?.h === h ? 'activa' : ''}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.closest('.calor').getBoundingClientRect()
            setHover({ d, h, x: e.clientX - r.left, y: e.clientY - r.top })
          }}
          onFocus={(e) => setHover({ d, h, x: e.currentTarget.offsetLeft, y: e.currentTarget.offsetTop })}
          onBlur={() => setHover(null)} />
      ))}
    </>
  )
}
