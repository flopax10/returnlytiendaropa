import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../store.jsx';

export default function Ingresar() {
  const { iniciar } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState('');

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const sesion = await api(modo === 'login' ? '/login' : '/register', { body: form });
      iniciar(sesion);
      navigate(params.get('volver') ?? '/perfil');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      <h1>{modo === 'login' ? 'Ingresar' : 'Crear cuenta'}</h1>
      {modo === 'registro' && (
        <label>Nombre<input name="nombre" value={form.nombre} onChange={cambiar} required /></label>
      )}
      <label>Email<input name="email" type="email" value={form.email} onChange={cambiar} required /></label>
      <label>Contraseña<input name="password" type="password" value={form.password} onChange={cambiar} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="boton">{modo === 'login' ? 'Ingresar' : 'Crear cuenta'}</button>
      <button type="button" className="link" onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}>
        {modo === 'login' ? '¿No tenés cuenta? Creala' : 'Ya tengo cuenta'}
      </button>
    </form>
  );
}
