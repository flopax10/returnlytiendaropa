import { useState } from 'react';
import { linkDevolucion } from '../api.js';
import { useAuth } from '../store.jsx';

// Página de cambios y devoluciones. La gestión la hace Returnly: la tienda solo
// manda al cliente a su portal con el número de pedido y el email.
export default function Devoluciones() {
  const { cliente } = useAuth();
  const [numero, setNumero] = useState('');
  const [email, setEmail] = useState(cliente?.email ?? '');

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
    </div>
  );
}
