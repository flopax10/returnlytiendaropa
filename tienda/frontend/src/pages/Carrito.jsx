import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, precio } from '../api.js';
import { useAuth, useCart } from '../store.jsx';

export default function Carrito() {
  const { items, cambiarCantidad, vaciar, total } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (!token) return navigate('/ingresar?volver=/carrito');
    setEnviando(true);
    setError('');
    try {
      const res = await api('/checkout', {
        token,
        body: { items: items.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })) },
      });
      vaciar();
      setPedido(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (pedido) {
    return (
      <div className="centrado">
        <h1>¡Gracias por tu compra!</h1>
        <p>Tu número de pedido es <strong>{pedido.numero}</strong>.</p>
        <p className="muted">Lo vas a necesitar si querés hacer una devolución.</p>
        <Link to="/perfil" className="boton">Ver mis pedidos</Link>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="centrado">
        <h1>Tu carrito está vacío</h1>
        <Link to="/" className="boton">Ir a la tienda</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Carrito</h1>
      <ul className="lista">
        {items.map((i) => (
          <li key={i.varianteId} className="fila">
            <img src={i.imagen} alt="" />
            <div className="fila-info">
              <Link to={`/producto/${i.productoId}`}>{i.nombre}</Link>
              <span className="muted">{i.color} · Talle {i.talle}</span>
            </div>
            <div className="cantidad">
              <button onClick={() => cambiarCantidad(i.varianteId, i.cantidad - 1)} aria-label="Quitar uno">−</button>
              <span>{i.cantidad}</span>
              <button onClick={() => cambiarCantidad(i.varianteId, i.cantidad + 1)} aria-label="Agregar uno">+</button>
            </div>
            <span className="fila-precio">{precio(i.precio * i.cantidad)}</span>
          </li>
        ))}
      </ul>
      <div className="resumen">
        <span>Total</span>
        <strong>{precio(total)}</strong>
      </div>
      <p className="muted derecha">Demo: no se cobra nada, solo se registra el pedido.</p>
      {error && <p className="error">{error}</p>}
      <div className="derecha">
        <button className="boton" onClick={confirmar} disabled={enviando}>
          {token ? (enviando ? 'Confirmando…' : 'Confirmar compra') : 'Ingresá para comprar'}
        </button>
      </div>
    </>
  );
}
