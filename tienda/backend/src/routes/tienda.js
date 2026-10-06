import { Router } from 'express';
import {
  listarProductos, obtenerProducto, buscarClientePorEmail, buscarClientePorId,
  crearCliente, crearPedido, pedidosDeCliente,
} from '../datos.js';
import { hashPassword, verificarPassword, crearToken, requiereLogin } from '../auth.js';

export const tiendaRouter = Router();

const emailValido = (email) => /^\S+@\S+\.\S+$/.test(email ?? '');
const datosPublicos = ({ id, nombre, email }) => ({ id, nombre, email });

// ---- Catálogo ----

tiendaRouter.get('/products', async (_req, res) => {
  res.json(await listarProductos());
});

tiendaRouter.get('/products/:id', async (req, res) => {
  const producto = /^\d+$/.test(req.params.id) && await obtenerProducto(Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(producto);
});

// ---- Cuenta ----

tiendaRouter.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body ?? {};
  if (!nombre?.trim() || !emailValido(email) || (password ?? '').length < 6) {
    return res.status(400).json({ error: 'Completá nombre, un email válido y una contraseña de al menos 6 caracteres' });
  }
  const cliente = await crearCliente({ nombre: nombre.trim(), email, passwordHash: hashPassword(password) });
  if (!cliente) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  res.status(201).json({ token: crearToken(cliente.id), cliente: datosPublicos(cliente) });
});

tiendaRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const c = await buscarClientePorEmail(String(email ?? ''));
  if (!c || !verificarPassword(String(password ?? ''), c.passwordHash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  res.json({ token: crearToken(c.id), cliente: datosPublicos(c) });
});

tiendaRouter.get('/me', requiereLogin, async (req, res) => {
  const c = await buscarClientePorId(req.clienteId);
  if (!c) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  res.json(datosPublicos(c));
});

// Historial de pedidos del cliente logueado, con sus ítems
tiendaRouter.get('/me/orders', requiereLogin, async (req, res) => {
  res.json(await pedidosDeCliente(req.clienteId));
});

// ---- Checkout (sin pago real) ----
// Body: { items: [{ varianteId, cantidad }] }
tiendaRouter.post('/checkout', requiereLogin, async (req, res) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || !items.length ||
      items.some((i) => !Number.isInteger(i.varianteId) || !Number.isInteger(i.cantidad) || i.cantidad < 1)) {
    return res.status(400).json({ error: 'El carrito está vacío o tiene ítems inválidos' });
  }
  try {
    const pedido = await crearPedido(req.clienteId, items);
    res.status(201).json({ numero: pedido.numero, fecha: pedido.fecha });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  }
});
