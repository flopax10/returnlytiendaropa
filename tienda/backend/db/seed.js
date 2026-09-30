// Carga datos de ejemplo: catálogo de 8 productos, 20 clientes y ~200 pedidos de los últimos 4 meses.
// Usa un generador pseudoaleatorio con semilla fija, así los datos salen siempre iguales.
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const PASSWORD_DEMO = 'demo1234';

const TALLES_ROPA = ['S', 'M', 'L', 'XL'];
const TALLES_PANTALON = ['38', '40', '42', '44'];
const TALLES_CALZADO = ['38', '39', '40', '41', '42', '43', '44'];

const PRODUCTOS = [
  { nombre: 'Remera Básica Negra', categoria: 'Remeras', precio: 690, talles: TALLES_ROPA, colores: ['Negro'], peso: 6,
    imagen: '/img/remera-negra.svg', descripcion: 'Remera de algodón peinado, cuello redondo y corte recto.' },
  { nombre: 'Remera Rayada', categoria: 'Remeras', precio: 790, talles: TALLES_ROPA, colores: ['Blanco y azul'], peso: 4,
    imagen: '/img/remera-rayada.svg', descripcion: 'Remera de algodón a rayas, estilo marinero.' },
  { nombre: 'Jean Recto', categoria: 'Pantalones', precio: 2190, talles: TALLES_PANTALON, colores: ['Azul'], peso: 4,
    imagen: '/img/jean-recto.svg', descripcion: 'Jean de denim rígido, tiro medio y pierna recta.' },
  { nombre: 'Pantalón Cargo', categoria: 'Pantalones', precio: 1990, talles: TALLES_PANTALON, colores: ['Verde oliva', 'Beige'], peso: 3,
    imagen: '/img/pantalon-cargo.svg', descripcion: 'Pantalón de gabardina con bolsillos laterales.' },
  { nombre: 'Vestido Midi', categoria: 'Vestidos', precio: 1890, talles: TALLES_ROPA, colores: ['Negro', 'Bordó'], peso: 3,
    imagen: '/img/vestido-midi.svg', descripcion: 'Vestido midi de viscosa con breteles finos.' },
  { nombre: 'Championes Urbanos', categoria: 'Championes', precio: 2990, talles: TALLES_CALZADO, colores: ['Blanco'], peso: 4,
    imagen: '/img/championes-urbanos.svg', descripcion: 'Championes de cuero sintético, suela de goma.' },
  { nombre: 'Championes Running', categoria: 'Championes', precio: 3490, talles: TALLES_CALZADO, colores: ['Negro', 'Gris'], peso: 3,
    imagen: '/img/championes-running.svg', descripcion: 'Championes livianos con malla respirable y amortiguación.' },
  { nombre: 'Lentes de Sol Clásicos', categoria: 'Accesorios', precio: 1290, talles: ['Único'], colores: ['Negro', 'Carey'], peso: 2,
    imagen: '/img/lentes-sol.svg', descripcion: 'Lentes con protección UV400 y armazón de acetato.' },
];

const CLIENTES = [
  ['Lucía Fernández', 'lucia.fernandez@example.com'], ['Martín Rodríguez', 'martin.rodriguez@example.com'],
  ['Sofía González', 'sofia.gonzalez@example.com'], ['Diego Pérez', 'diego.perez@example.com'],
  ['Valentina López', 'valentina.lopez@example.com'], ['Joaquín Martínez', 'joaquin.martinez@example.com'],
  ['Camila Sánchez', 'camila.sanchez@example.com'], ['Federico Gómez', 'federico.gomez@example.com'],
  ['Agustina Díaz', 'agustina.diaz@example.com'], ['Nicolás Silva', 'nicolas.silva@example.com'],
  ['Florencia Castro', 'florencia.castro@example.com'], ['Santiago Romero', 'santiago.romero@example.com'],
  ['Micaela Suárez', 'micaela.suarez@example.com'], ['Tomás Álvarez', 'tomas.alvarez@example.com'],
  ['Carolina Torres', 'carolina.torres@example.com'], ['Gonzalo Ruiz', 'gonzalo.ruiz@example.com'],
  ['Paula Ramírez', 'paula.ramirez@example.com'], ['Bruno Acosta', 'bruno.acosta@example.com'],
  ['Victoria Méndez', 'victoria.mendez@example.com'], ['Andrés Benítez', 'andres.benitez@example.com'],
];

// Generador pseudoaleatorio con semilla (mulberry32)
let semilla = 20260930;
function rand() {
  semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const elegir = (lista) => lista[Math.floor(rand() * lista.length)];
function elegirPonderado(lista) {
  const total = lista.reduce((s, x) => s + x.peso, 0);
  let r = rand() * total;
  for (const x of lista) { if ((r -= x.peso) < 0) return x; }
  return lista[lista.length - 1];
}
const diasAtras = (d) => new Date(Date.now() - d * 24 * 3600 * 1000);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('TRUNCATE item_pedido, pedido, cliente, variante, producto RESTART IDENTITY CASCADE');
  await client.query("SELECT setval('pedido_numero_seq', 1000, false)");

  // Catálogo
  const variantes = []; // { id, productoIdx, talle, color, precio }
  for (const [i, p] of PRODUCTOS.entries()) {
    const { rows: [prod] } = await client.query(
      'INSERT INTO producto (nombre, categoria, descripcion, precio, imagen) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [p.nombre, p.categoria, p.descripcion, p.precio, p.imagen]);
    for (const color of p.colores) {
      for (const talle of p.talles) {
        const sku = `P${String(prod.id).padStart(2, '0')}-${color.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${talle.slice(0, 3).toUpperCase()}`;
        const { rows: [v] } = await client.query(
          'INSERT INTO variante (producto_id, talle, color, sku) VALUES ($1,$2,$3,$4) RETURNING id',
          [prod.id, talle, color, sku]);
        variantes.push({ id: v.id, productoIdx: i, talle, color, precio: p.precio });
      }
    }
  }

  // Clientes (todos con la contraseña de demo)
  const hashDemo = hashPassword(PASSWORD_DEMO);
  const clienteIds = [];
  for (const [nombre, email] of CLIENTES) {
    const { rows: [c] } = await client.query(
      'INSERT INTO cliente (nombre, email, password_hash) VALUES ($1,$2,$3) RETURNING id', [nombre, email, hashDemo]);
    clienteIds.push(c.id);
  }

  const crearPedido = async (clienteId, fecha, items) => {
    const { rows: [ped] } = await client.query(
      'INSERT INTO pedido (cliente_id, fecha) VALUES ($1,$2) RETURNING id, numero', [clienteId, fecha]);
    for (const { variante, cantidad } of items) {
      await client.query(
        'INSERT INTO item_pedido (pedido_id, variante_id, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
        [ped.id, variante.id, cantidad, variante.precio]);
    }
    return ped.numero;
  };

  // 200 pedidos aleatorios, en orden cronológico (de hace 120 días a hace 3 días)
  const CANT_PEDIDOS = 200;
  const fechas = Array.from({ length: CANT_PEDIDOS }, () => 3 + rand() * 117).sort((a, b) => b - a);
  for (const d of fechas) {
    const cantItems = 1 + Math.floor(rand() * 3);
    const items = [];
    for (let k = 0; k < cantItems; k++) {
      const pIdx = PRODUCTOS.indexOf(elegirPonderado(PRODUCTOS));
      const variante = elegir(variantes.filter((v) => v.productoIdx === pIdx));
      if (items.some((it) => it.variante.id === variante.id)) continue;
      items.push({ variante, cantidad: rand() < 0.85 ? 1 : 2 });
    }
    await crearPedido(elegir(clienteIds), diasAtras(d), items);
  }

  // Pedidos fijos para la demo (siempre con el mismo número y datos)
  const buscar = (nombre, talle, color) =>
    variantes.find((v) => PRODUCTOS[v.productoIdx].nombre === nombre && v.talle === talle && v.color === color);
  const demo1 = await crearPedido(clienteIds[0], diasAtras(2), [
    { variante: buscar('Remera Básica Negra', 'S', 'Negro'), cantidad: 1 },
    { variante: buscar('Jean Recto', '40', 'Azul'), cantidad: 1 },
  ]);
  const demo2 = await crearPedido(clienteIds[1], diasAtras(1), [
    { variante: buscar('Championes Running', '42', 'Negro'), cantidad: 1 },
    { variante: buscar('Lentes de Sol Clásicos', 'Único', 'Carey'), cantidad: 1 },
  ]);

  await client.query('COMMIT');
  console.log(`Semilla cargada: ${PRODUCTOS.length} productos, ${variantes.length} variantes, ` +
    `${CLIENTES.length} clientes, ${CANT_PEDIDOS + 2} pedidos.`);
  console.log(`Pedidos de demo: ${demo1} (${CLIENTES[0][1]}), ${demo2} (${CLIENTES[1][1]})`);
  console.log(`Todos los clientes de ejemplo entran con la contraseña "${PASSWORD_DEMO}".`);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
