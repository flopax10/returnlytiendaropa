import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, linkDevolucion, precio } from '../api.js';
import { useAuth } from '../store.jsx';

const PLAZO_DEVOLUCION_DIAS = 30;

export default function Perfil() {
  const { token, cliente, salir } = useAuth();
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/me/orders', { token }).then(setPedidos).catch((e) => {
      if (e.status === 401) salir();
      setError(e.message);
    });
  }, [token]);

  if (!token) return <Navigate to="/ingresar" replace />;

  return (
    <>
      <div className="perfil-cabezal">
        <div>
          <h1>{cliente.nombre}</h1>
          <p className="muted">{cliente.email}</p>
        </div>
        <button className="boton secundario" onClick={salir}>Cerrar sesión</button>
      </div>

      <h2>Mis pedidos</h2>
      {error && <p className="error">{error}</p>}
      {pedidos && !pedidos.length && <p className="muted">Todavía no hiciste ningún pedido.</p>}
      {pedidos?.map((p) => {
        const dias = (Date.now() - new Date(p.fecha)) / 86400000;
        const puedeDevolver = dias <= PLAZO_DEVOLUCION_DIAS && p.items.some((i) => !i.devuelto);
        return (
          <section key={p.numero} className="pedido">
            <div className="pedido-cabezal">
              <div>
                <strong>{p.numero}</strong>
                <span className="muted"> · {new Date(p.fecha).toLocaleDateString('es-UY')} · {precio(p.total)}</span>
              </div>
              {puedeDevolver && (
                <a className="boton secundario" href={linkDevolucion(p.numero, cliente.email)}>Solicitar devolución</a>
              )}
            </div>
            <ul className="lista">
              {p.items.map((i, k) => (
                <li key={k} className="fila">
                  <img src={i.imagen} alt="" />
                  <div className="fila-info">
                    <span>{i.producto}</span>
                    <span className="muted">{i.color} · Talle {i.talle} · x{i.cantidad}</span>
                  </div>
                  {i.devuelto && <span className="etiqueta-devuelto">Devuelto</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
