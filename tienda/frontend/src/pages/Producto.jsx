import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, precio } from '../api.js';
import { useCart } from '../store.jsx';

export default function Producto() {
  const { id } = useParams();
  const { agregar } = useCart();
  const [producto, setProducto] = useState(null);
  const [color, setColor] = useState('');
  const [talle, setTalle] = useState('');
  const [agregado, setAgregado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/products/${id}`).then((p) => {
      setProducto(p);
      setColor(p.variantes[0].color);
      const talles = [...new Set(p.variantes.map((v) => v.talle))];
      setTalle(talles.length === 1 ? talles[0] : '');
    }).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!producto) return <p className="muted">Cargando…</p>;

  const colores = [...new Set(producto.variantes.map((v) => v.color))];
  const talles = producto.variantes.filter((v) => v.color === color).map((v) => v.talle);
  const variante = producto.variantes.find((v) => v.color === color && v.talle === talle);

  const alAgregar = () => {
    agregar({
      varianteId: variante.id, productoId: producto.id, nombre: producto.nombre,
      imagen: producto.imagen, talle, color, precio: producto.precio,
    });
    setAgregado(true);
  };

  return (
    <div className="producto">
      <img src={producto.imagen} alt={producto.nombre} />
      <div className="producto-info">
        <p className="muted">{producto.categoria}</p>
        <h1>{producto.nombre}</h1>
        <p className="precio">{precio(producto.precio)}</p>
        <p>{producto.descripcion}</p>

        <p className="etiqueta">Color</p>
        <div className="opciones">
          {colores.map((c) => (
            <button key={c} className={c === color ? 'opcion activa' : 'opcion'}
              onClick={() => { setColor(c); setAgregado(false); }}>{c}</button>
          ))}
        </div>

        <p className="etiqueta">Talle</p>
        <div className="opciones">
          {talles.map((t) => (
            <button key={t} className={t === talle ? 'opcion activa' : 'opcion'}
              onClick={() => { setTalle(t); setAgregado(false); }}>{t}</button>
          ))}
        </div>

        <button className="boton" disabled={!variante} onClick={alAgregar}>
          {variante ? 'Agregar al carrito' : 'Elegí un talle'}
        </button>
        {agregado && <p className="ok">Agregado. <Link to="/carrito">Ver carrito</Link></p>}
      </div>
    </div>
  );
}
