// "Hacé una pregunta": el usuario pregunta sobre su tienda y el backend responde con IA usando SOLO sus datos.
import { useState } from 'react'
import { api } from '../api.js'

const EJEMPLOS = [
  '¿Qué categoría tiene mejor conversión?',
  '¿Qué día de la semana se vende más?',
  '¿Cuántos carritos se abandonan y qué puedo hacer?',
  '¿Cuál es el producto más visto que menos se vende?',
]

export default function Preguntar({ empresa }) {
  const [pregunta, setPregunta] = useState('')
  const [historial, setHistorial] = useState([]) // [{ pregunta, respuesta, suficiente, error }]
  const [pensando, setPensando] = useState(false)

  const enviar = async (texto) => {
    const q = (texto ?? pregunta).trim()
    if (q.length < 3 || pensando) return
    setPensando(true)
    setPregunta('')
    try {
      const r = await api('/preguntar', { body: { pregunta: q, empresa: empresa.id } })
      setHistorial((h) => [{ pregunta: q, ...r }, ...h])
    } catch (err) {
      setHistorial((h) => [{ pregunta: q, error: err.message }, ...h])
    } finally {
      setPensando(false)
    }
  }

  return (
    <section className="tarjeta preguntar">
      <h2>Hacé una pregunta</h2>
      <p className="subtitulo">
        Preguntá lo que quieras sobre tu tienda. La respuesta sale solo de tus datos: si no alcanzan, te lo decimos.
      </p>
      <form className="preguntar-form" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Por ejemplo: ¿qué productos convienen poner en la home?"
          maxLength={500}
          aria-label="Tu pregunta"
          disabled={pensando}
        />
        <button className="boton" disabled={pensando || pregunta.trim().length < 3}>{pensando ? 'Pensando…' : 'Preguntar'}</button>
      </form>
      {!historial.length && !pensando && (
        <div className="preguntar-ejemplos">
          {EJEMPLOS.map((e) => <button key={e} className="boton-vista" onClick={() => enviar(e)}>{e}</button>)}
        </div>
      )}
      {pensando && <p className="cargando">Analizando tus datos…</p>}
      <div className="preguntar-historial">
        {historial.map((h, i) => (
          <article key={historial.length - i} className="preguntar-item">
            <p className="preguntar-q">{h.pregunta}</p>
            {h.error
              ? <p className="error">{h.error}</p>
              : (
                <>
                  <span className={`estado ${h.suficiente ? 'estado-ok' : 'estado-mal'}`}>
                    <span aria-hidden="true">{h.suficiente ? '●' : '■'}</span> {h.suficiente ? 'Respaldado por tus datos' : 'Datos insuficientes'}
                  </span>
                  <p className="preguntar-a">{h.respuesta}</p>
                  {h.suficiente && h.datos_usados?.length > 0 && <p className="muted">Datos usados: {h.datos_usados.join(', ')}</p>}
                </>
              )}
          </article>
        ))}
      </div>
    </section>
  )
}
