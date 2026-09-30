import { useEffect, useState } from 'react';
import { linkDevolucion } from '../api.js';
import { useAuth } from '../store.jsx';
import { supabase } from '../supabase.js';

// Página de cambios y devoluciones. La gestión la hace Returnly: la tienda solo
// manda al cliente a su portal con el número de pedido y el email.
export default function Devoluciones() {
  const { cliente } = useAuth();
  const [numero, setNumero] = useState('');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [motivos, setMotivos] = useState(null);
  const [errorMotivos, setErrorMotivos] = useState('');

  // Motivos de devolución guardados en la tabla "motivo" de Supabase
  useEffect(() => {
    supabase('motivo', 'select=id,categoria,subopciones&order=orden')
      .then(setMotivos).catch((e) => setErrorMotivos(e.message));
  }, []);

  const enviar = (e) => {
    e.preventDefault();
    window.location.href = linkDevolucion(numero.trim().toUpperCase(), email.trim());
  };

  return (
    <div className="devoluciones">
      <h1>Cambios y devoluciones</h1>
      <p>Tenés 30 días desde la compra para devolver un producto. Solo necesitás tu número de pedido
        (por ejemplo <strong>TR-1200</strong>) y el email con el que compraste.</p>
      <p className="muted">Las devoluciones se gestionan a través de Returnly.</p>
      <form className="formulario" onSubmit={enviar}>
        <label>Número de pedido<input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="TR-1200" required /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <button className="boton">Iniciar devolución</button>
      </form>

      <h2>Motivos de devolución</h2>
      {errorMotivos && <p className="error">{errorMotivos}</p>}
      {!motivos && !errorMotivos && <p className="muted">Cargando…</p>}
      {motivos && (
        <ul className="motivos">
          {motivos.map((m) => (
            <li key={m.id}>
              <strong>{m.categoria}</strong>
              {m.subopciones.length > 0 && <span className="muted"> · {m.subopciones.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
