import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function Motivos() {
  const [motivos, setMotivos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('motivo')
      .select('id, categoria, subopciones, requiere_comentario, orden')
      .order('orden')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMotivos(data)
        setCargando(false)
      })
  }, [])

  return (
    <main className="contenedor">
      <header>
        <h1>Returnly</h1>
        <p className="subtitulo">Motivos de devolución disponibles</p>
      </header>

      {cargando && <p>Cargando motivos…</p>}
      {error && <p className="error">No se pudieron cargar los motivos: {error}</p>}

      {!cargando && !error && (
        <ul className="lista">
          {motivos.map((m) => (
            <li key={m.id} className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>{m.categoria}</h2>
                {m.requiere_comentario && <span className="etiqueta">Requiere comentario</span>}
              </div>
              {m.subopciones?.length > 0 && (
                <ul className="subopciones">
                  {m.subopciones.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
