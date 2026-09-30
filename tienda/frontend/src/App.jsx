import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth, useCart } from './store.jsx';
import Catalogo from './pages/Catalogo.jsx';
import Producto from './pages/Producto.jsx';
import Carrito from './pages/Carrito.jsx';
import Ingresar from './pages/Ingresar.jsx';
import Perfil from './pages/Perfil.jsx';
import Devoluciones from './pages/Devoluciones.jsx';

export const CATEGORIAS = ['Remeras', 'Pantalones', 'Vestidos', 'Championes', 'Accesorios'];

export default function App() {
  const { cliente } = useAuth();
  const { cantidad } = useCart();

  return (
    <>
      <header className="header">
        <div className="header-top">
          <Link to="/" className="logo">TRAMA</Link>
          <nav className="acciones">
            <NavLink to={cliente ? '/perfil' : '/ingresar'}>{cliente ? cliente.nombre.split(' ')[0] : 'Ingresar'}</NavLink>
            <NavLink to="/carrito">Carrito ({cantidad})</NavLink>
          </nav>
        </div>
        <nav className="menu">
          <NavLink to="/" end>Todo</NavLink>
          {CATEGORIAS.map((c) => <NavLink key={c} to={`/categoria/${c}`}>{c}</NavLink>)}
          <NavLink to="/devoluciones">Devoluciones</NavLink>
        </nav>
      </header>

      <main className="contenido">
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/categoria/:categoria" element={<Catalogo />} />
          <Route path="/producto/:id" element={<Producto />} />
          <Route path="/carrito" element={<Carrito />} />
          <Route path="/ingresar" element={<Ingresar />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/devoluciones" element={<Devoluciones />} />
          <Route path="*" element={<p>Página no encontrada. <Link to="/">Volver a la tienda</Link></p>} />
        </Routes>
      </main>

      <footer className="footer">TRAMA · Tienda de demostración para el prototipo de Returnly</footer>
    </>
  );
}
