// Datos de la tienda guardados EN MEMORIA (por ahora no hay base de datos).
// Al arrancar se cargan los datos de ejemplo de semilla.js; si se reinicia el servidor,
// todo vuelve a ese estado. Es el único archivo que toca los datos: cuando se elija
// una base, se reemplaza este archivo manteniendo las mismas funciones.
import { cargarSemilla } from './semilla.js';

const db = { productos: [], variantes: [], clientes: [], pedidos: [], items: [] };
let proximoNumeroPedido = 1000;
const nuevoId = (tabla) => (db[tabla].at(-1)?.id ?? 0) + 1;

// ---- Catálogo ----

function conVariantes(p) {
  const variantes = db.variantes.filter((v) => v.productoId === p.id)
    .map(({ id, talle, color, sku }) => ({ id, talle, color, sku }));
  return { ...p, variantes };
}

export async function listarProductos() {
  return db.productos.map(conVariantes);
}

export async function obtenerProducto(id) {
  const p = db.productos.find((x) => x.id === id);
  return p && conVariantes(p);
}

export function crearProducto({ nombre, categoria, descripcion, precio, imagen }) {
  const p = { id: nuevoId('productos'), nombre, categoria, descripcion, precio, imagen };
  db.productos.push(p);
  return p;
}

export function crearVariante({ productoId, talle, color, sku }) {
  const v = { id: nuevoId('variantes'), productoId, talle, color, sku };
  db.variantes.push(v);
  return v;
}

// ---- Clientes ----

export async function buscarClientePorEmail(email) {
  return db.clientes.find((c) => c.email === email.trim().toLowerCase());
}

export async function buscarClientePorId(id) {
  return db.clientes.find((c) => c.id === id);
}

// Devuelve null si ya existe una cuenta con ese email
export async function crearCliente({ nombre, email, passwordHash }) {
  if (await buscarClientePorEmail(email)) return null;
  const c = { id: nuevoId('clientes'), nombre, email: email.trim().toLowerCase(), passwordHash };
  db.clientes.push(c);
  return c;
}

// ---- Pedidos ----

// items: [{ varianteId, cantidad }]. Tira error si alguna variante no existe.
export async function crearPedido(clienteId, items, fecha = new Date()) {
  const lineas = items.map(({ varianteId, cantidad }) => {
    const v = db.variantes.find((x) => x.id === varianteId);
    if (!v) throw Object.assign(new Error('Variante inexistente'), { status: 400 });
    const precio = db.productos.find((p) => p.id === v.productoId).precio;
    return { varianteId, cantidad, precioUnitario: precio };
  });
  const pedido = { id: nuevoId('pedidos'), numero: `TR-${proximoNumeroPedido++}`, clienteId, fecha, estado: 'entregado' };
  db.pedidos.push(pedido);
  for (const l of lineas) {
    db.items.push({ id: nuevoId('items'), pedidoId: pedido.id, ...l, devuelto: false, devolucionRef: null });
  }
  return pedido;
}

// Ítem de pedido con los datos del producto y la variante
function detalleItem(it) {
  const v = db.variantes.find((x) => x.id === it.varianteId);
  const p = db.productos.find((x) => x.id === v.productoId);
  return { it, v, p };
}

export async function pedidosDeCliente(clienteId) {
  return db.pedidos.filter((pe) => pe.clienteId === clienteId)
    .sort((a, b) => b.fecha - a.fecha)
    .map((pe) => {
      const items = db.items.filter((it) => it.pedidoId === pe.id).map(detalleItem);
      return {
        numero: pe.numero, fecha: pe.fecha, estado: pe.estado,
        total: items.reduce((s, { it }) => s + it.cantidad * it.precioUnitario, 0),
        items: items.map(({ it, v, p }) => ({
          producto: p.nombre, imagen: p.imagen, talle: v.talle, color: v.color,
          cantidad: it.cantidad, precioUnitario: it.precioUnitario, devuelto: it.devuelto,
        })),
      };
    });
}

// ---- Integración con Returnly ----

// Pedido con sus ítems, solo si el número y el email coinciden (sin distinguir mayúsculas)
export async function buscarPedido(numero, email) {
  const pe = db.pedidos.find((x) => x.numero.toUpperCase() === numero.toUpperCase());
  const c = pe && db.clientes.find((x) => x.id === pe.clienteId);
  if (!c || c.email !== email.toLowerCase()) return undefined;
  return {
    numero: pe.numero, fecha: pe.fecha, estado: pe.estado,
    cliente: { nombre: c.nombre, email: c.email },
    items: db.items.filter((it) => it.pedidoId === pe.id).map(detalleItem).map(({ it, v, p }) => ({
      id: it.id, sku: v.sku, productoId: p.id, producto: p.nombre, categoria: p.categoria,
      talle: v.talle, color: v.color, cantidad: it.cantidad, precioUnitario: it.precioUnitario,
      devuelto: it.devuelto,
    })),
  };
}

export async function marcarDevueltos(itemIds, referencia) {
  for (const it of db.items) {
    if (itemIds.includes(it.id)) Object.assign(it, { devuelto: true, devolucionRef: referencia ?? null });
  }
}

// Unidades vendidas por variante entre dos fechas (YYYY-MM-DD, ambas incluidas)
export async function resumenVentas(desde, hasta) {
  const inicio = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  fin.setDate(fin.getDate() + 1);
  const unidades = new Map();
  for (const it of db.items) {
    const pe = db.pedidos.find((x) => x.id === it.pedidoId);
    if (pe.fecha >= inicio && pe.fecha < fin) {
      unidades.set(it.varianteId, (unidades.get(it.varianteId) ?? 0) + it.cantidad);
    }
  }
  return db.variantes.filter((v) => unidades.has(v.id)).map((v) => {
    const p = db.productos.find((x) => x.id === v.productoId);
    return {
      productoId: p.id, producto: p.nombre, categoria: p.categoria,
      sku: v.sku, talle: v.talle, color: v.color, unidades: unidades.get(v.id),
    };
  }).sort((a, b) => a.productoId - b.productoId || a.sku.localeCompare(b.sku));
}

await cargarSemilla();
