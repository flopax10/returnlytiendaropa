import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, precio } from '../api.js';

export default function Catalogo() {
  const { categoria } = useParams();
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/products').then(setProductos).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!productos) return <p className="muted">Cargando…</p>;

  const lista = categoria ? productos.filter((p) => p.categoria === categoria) : productos;

  return (
    <>
      <h1>{categoria ?? 'Nueva temporada'}</h1>
      <div className="grilla">
        {lista.map((p) => (
          <Link key={p.id} to={`/producto/${p.id}`} className="tarjeta">
            <img src={p.imagen} alt={p.nombre} />
            <div className="tarjeta-info">
              <span>{p.nombre}</span>
              <span className="muted">{precio(p.precio)}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
