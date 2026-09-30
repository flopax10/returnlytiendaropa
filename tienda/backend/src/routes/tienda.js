import { Router } from 'express';
import { pool } from '../db.js';
import { hashPassword, verificarPassword, crearToken, requiereLogin } from '../auth.js';

export const tiendaRouter = Router();

const SQL_PRODUCTOS = `
  SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio::float AS precio, p.imagen,
         json_agg(json_build_object('id', v.id, 'talle', v.talle, 'color', v.color, 'sku', v.sku)
                  ORDER BY v.id) AS variantes
  FROM producto p JOIN variante v ON v.producto_id = p.id`;

const emailValido = (email) => /^\S+@\S+\.\S+$/.test(email ?? '');

// ---- Catálogo ----

tiendaRouter.get('/products', async (_req, res) => {
  const { rows } = await pool.query(`${SQL_PRODUCTOS} GROUP BY p.id ORDER BY p.id`);
  res.json(rows);
});

tiendaRouter.get('/products/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Producto no encontrado' });
  const { rows } = await pool.query(`${SQL_PRODUCTOS} WHERE p.id = $1 GROUP BY p.id`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

// ---- Cuenta ----

tiendaRouter.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body ?? {};
  if (!nombre?.trim() || !emailValido(email) || (password ?? '').length < 6) {
    return res.status(400).json({ error: 'Completá nombre, un email válido y una contraseña de al menos 6 caracteres' });
  }
  const { rows } = await pool.query(
    `INSERT INTO cliente (nombre, email, password_hash) VALUES ($1, lower($2), $3)
     ON CONFLICT (email) DO NOTHING RETURNING id, nombre, email`,
    [nombre.trim(), email.trim(), hashPassword(password)]);
  if (!rows.length) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  res.status(201).json({ token: crearToken(rows[0].id), cliente: rows[0] });
});

tiendaRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows: [c] } = await pool.query(
    'SELECT id, nombre, email, password_hash FROM cliente WHERE email = lower($1)', [(email ?? '').trim()]);
  if (!c || !verificarPassword(password ?? '', c.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  res.json({ token: crearToken(c.id), cliente: { id: c.id, nombre: c.nombre, email: c.email } });
});

tiendaRouter.get('/me', requiereLogin, async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT id, nombre, email FROM cliente WHERE id = $1', [req.clienteId]);
  if (!c) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  res.json(c);
});

// Historial de pedidos del cliente logueado, con sus ítems
tiendaRouter.get('/me/orders', requiereLogin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pe.numero, pe.fecha, pe.estado,
            SUM(ip.cantidad * ip.precio_unitario)::float AS total,
            json_agg(json_build_object(
              'producto', p.nombre, 'imagen', p.imagen, 'talle', v.talle, 'color', v.color,
              'cantidad', ip.cantidad, 'precioUnitario', ip.precio_unitario::float,
              'devuelto', ip.devuelto) ORDER BY ip.id) AS items
     FROM pedido pe
     JOIN item_pedido ip ON ip.pedido_id = pe.id
     JOIN variante v ON v.id = ip.variante_id
     JOIN producto p ON p.id = v.producto_id
     WHERE pe.cliente_id = $1
     GROUP BY pe.id ORDER BY pe.fecha DESC`,
    [req.clienteId]);
  res.json(rows);
});

// ---- Checkout (sin pago real) ----
// Body: { items: [{ varianteId, cantidad }] }
tiendaRouter.post('/checkout', requiereLogin, async (req, res) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || !items.length ||
      items.some((i) => !Number.isInteger(i.varianteId) || !Number.isInteger(i.cantidad) || i.cantidad < 1)) {
    return res.status(400).json({ error: 'El carrito está vacío o tiene ítems inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [pedido] } = await client.query(
      'INSERT INTO pedido (cliente_id) VALUES ($1) RETURNING id, numero, fecha', [req.clienteId]);
    for (const { varianteId, cantidad } of items) {
      const { rowCount } = await client.query(
        `INSERT INTO item_pedido (pedido_id, variante_id, cantidad, precio_unitario)
         SELECT $1, v.id, $3, p.precio FROM variante v JOIN producto p ON p.id = v.producto_id WHERE v.id = $2`,
        [pedido.id, varianteId, cantidad]);
      if (!rowCount) throw Object.assign(new Error('Variante inexistente'), { status: 400 });
    }
    await client.query('COMMIT');
    res.status(201).json({ numero: pedido.numero, fecha: pedido.fecha });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});
