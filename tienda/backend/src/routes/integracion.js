// API que la tienda expone para Returnly (integración entre empresas).
// Todas las rutas exigen el header  x-api-key: <RETURNLY_API_KEY>
import { Router } from 'express';
import { pool } from '../db.js';

export const integracionRouter = Router();

integracionRouter.use((req, res, next) => {
  const esperada = process.env.RETURNLY_API_KEY ?? 'clave-demo-returnly';
  if (req.get('x-api-key') !== esperada) return res.status(401).json({ error: 'API key inválida' });
  next();
});

async function buscarPedido(numero, email) {
  const { rows } = await pool.query(
    `SELECT pe.id, pe.numero, pe.fecha, pe.estado,
            json_build_object('nombre', c.nombre, 'email', c.email) AS cliente,
            json_agg(json_build_object(
              'id', ip.id, 'sku', v.sku, 'productoId', p.id, 'producto', p.nombre,
              'categoria', p.categoria, 'talle', v.talle, 'color', v.color,
              'cantidad', ip.cantidad, 'precioUnitario', ip.precio_unitario::float,
              'devuelto', ip.devuelto) ORDER BY ip.id) AS items
     FROM pedido pe
     JOIN cliente c ON c.id = pe.cliente_id
     JOIN item_pedido ip ON ip.pedido_id = pe.id
     JOIN variante v ON v.id = ip.variante_id
     JOIN producto p ON p.id = v.producto_id
     WHERE upper(pe.numero) = upper($1) AND lower(c.email) = lower($2)
     GROUP BY pe.id, c.id`,
    [numero, email]);
  return rows[0];
}

// GET /api/orders?number=TR-1200&email=lucia.fernandez@example.com
// Devuelve el pedido con sus ítems, solo si el número y el email coinciden.
integracionRouter.get('/orders', async (req, res) => {
  const { number, email } = req.query;
  if (!number || !email) return res.status(400).json({ error: 'Faltan number y email' });
  const pedido = await buscarPedido(String(number).trim(), String(email).trim());
  if (!pedido) return res.status(404).json({ error: 'No existe un pedido con ese número y email' });
  const { id, ...resto } = pedido;
  res.json(resto);
});

// POST /api/orders/:number/returns
// Body: { email, itemIds: [..], referencia: "RET-0001" }
// Returnly avisa que se registró una devolución; la tienda marca esos ítems como devueltos.
integracionRouter.post('/orders/:number/returns', async (req, res) => {
  const { email, itemIds, referencia } = req.body ?? {};
  if (!email || !Array.isArray(itemIds) || !itemIds.length) {
    return res.status(400).json({ error: 'Faltan email e itemIds' });
  }
  const pedido = await buscarPedido(req.params.number, email);
  if (!pedido) return res.status(404).json({ error: 'No existe un pedido con ese número y email' });

  const ajenos = itemIds.filter((i) => !pedido.items.some((it) => it.id === i));
  if (ajenos.length) return res.status(400).json({ error: `Ítems que no son de este pedido: ${ajenos.join(', ')}` });
  const yaDevueltos = pedido.items.filter((it) => itemIds.includes(it.id) && it.devuelto).map((it) => it.id);
  if (yaDevueltos.length) return res.status(409).json({ error: `Ítems ya devueltos: ${yaDevueltos.join(', ')}` });

  await pool.query(
    'UPDATE item_pedido SET devuelto = true, devolucion_ref = $2 WHERE id = ANY($1::int[])',
    [itemIds, referencia ?? null]);
  res.json({ ok: true, numero: pedido.numero, itemsDevueltos: itemIds });
});

// GET /api/sales-summary?desde=2026-06-01&hasta=2026-09-30
// Unidades vendidas por producto y variante, para calcular la tasa de devolución.
integracionRouter.get('/sales-summary', async (req, res) => {
  const desde = req.query.desde ?? '1970-01-01';
  const hasta = req.query.hasta ?? '2999-12-31';
  const { rows } = await pool.query(
    `SELECT p.id AS "productoId", p.nombre AS producto, p.categoria, v.sku, v.talle, v.color,
            SUM(ip.cantidad)::int AS unidades
     FROM item_pedido ip
     JOIN pedido pe ON pe.id = ip.pedido_id
     JOIN variante v ON v.id = ip.variante_id
     JOIN producto p ON p.id = v.producto_id
     WHERE pe.fecha >= $1::date AND pe.fecha < $2::date + 1
     GROUP BY p.id, v.id ORDER BY p.id, v.sku`,
    [desde, hasta]);
  res.json({ desde, hasta, variantes: rows });
});
