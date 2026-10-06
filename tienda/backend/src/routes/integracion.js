// API que la tienda expone para Returnly (integración entre empresas).
// Todas las rutas exigen el header  x-api-key: <RETURNLY_API_KEY>
import { Router } from 'express';
import { buscarPedido, marcarDevueltos, resumenVentas } from '../datos.js';

export const integracionRouter = Router();

integracionRouter.use((req, res, next) => {
  const esperada = process.env.RETURNLY_API_KEY ?? 'clave-demo-returnly';
  if (req.get('x-api-key') !== esperada) return res.status(401).json({ error: 'API key inválida' });
  next();
});

// GET /api/orders?number=TR-1200&email=lucia.fernandez@example.com
// Devuelve el pedido con sus ítems, solo si el número y el email coinciden.
integracionRouter.get('/orders', async (req, res) => {
  const { number, email } = req.query;
  if (!number || !email) return res.status(400).json({ error: 'Faltan number y email' });
  const pedido = await buscarPedido(String(number).trim(), String(email).trim());
  if (!pedido) return res.status(404).json({ error: 'No existe un pedido con ese número y email' });
  res.json(pedido);
});

// POST /api/orders/:number/returns
// Body: { email, itemIds: [..], referencia: "RET-0001" }
// Returnly avisa que se registró una devolución; la tienda marca esos ítems como devueltos.
integracionRouter.post('/orders/:number/returns', async (req, res) => {
  const { email, itemIds, referencia } = req.body ?? {};
  if (!email || !Array.isArray(itemIds) || !itemIds.length) {
    return res.status(400).json({ error: 'Faltan email e itemIds' });
  }
  const pedido = await buscarPedido(req.params.number, String(email).trim());
  if (!pedido) return res.status(404).json({ error: 'No existe un pedido con ese número y email' });

  const ajenos = itemIds.filter((i) => !pedido.items.some((it) => it.id === i));
  if (ajenos.length) return res.status(400).json({ error: `Ítems que no son de este pedido: ${ajenos.join(', ')}` });
  const yaDevueltos = pedido.items.filter((it) => itemIds.includes(it.id) && it.devuelto).map((it) => it.id);
  if (yaDevueltos.length) return res.status(409).json({ error: `Ítems ya devueltos: ${yaDevueltos.join(', ')}` });

  await marcarDevueltos(itemIds, referencia);
  res.json({ ok: true, numero: pedido.numero, itemsDevueltos: itemIds });
});

// GET /api/sales-summary?desde=2026-06-01&hasta=2026-09-30
// Unidades vendidas por producto y variante, para calcular la tasa de devolución.
integracionRouter.get('/sales-summary', async (req, res) => {
  const desde = req.query.desde ?? '1970-01-01';
  const hasta = req.query.hasta ?? '2999-12-31';
  res.json({ desde, hasta, variantes: await resumenVentas(desde, hasta) });
});
