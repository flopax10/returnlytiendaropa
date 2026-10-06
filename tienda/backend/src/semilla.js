// Datos de ejemplo: catálogo de 8 productos, 20 clientes y ~200 pedidos de los últimos 4 meses.
// Usa un generador pseudoaleatorio con semilla fija, así los datos salen siempre iguales.
import { hashPassword } from './auth.js';
import { crearProducto, crearVariante, crearCliente, crearPedido } from './datos.js';

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

export async function cargarSemilla() {
  // Catálogo
  const variantes = []; // { id, productoIdx, talle, color }
  for (const [i, p] of PRODUCTOS.entries()) {
    const prod = crearProducto(p);
    for (const color of p.colores) {
      for (const talle of p.talles) {
        const sku = `P${String(prod.id).padStart(2, '0')}-${color.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${talle.slice(0, 3).toUpperCase()}`;
        const v = crearVariante({ productoId: prod.id, talle, color, sku });
        variantes.push({ id: v.id, productoIdx: i, talle, color });
      }
    }
  }

  // Clientes (todos con la contraseña de demo)
  const passwordHash = hashPassword(PASSWORD_DEMO);
  const clienteIds = [];
  for (const [nombre, email] of CLIENTES) {
    clienteIds.push((await crearCliente({ nombre, email, passwordHash })).id);
  }

  const pedido = (clienteId, fecha, items) =>
    crearPedido(clienteId, items.map(({ variante, cantidad }) => ({ varianteId: variante.id, cantidad })), fecha);

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
    await pedido(elegir(clienteIds), diasAtras(d), items);
  }

  // Pedidos fijos para la demo (siempre con el mismo número y datos): TR-1200 y TR-1201
  const buscar = (nombre, talle, color) =>
    variantes.find((v) => PRODUCTOS[v.productoIdx].nombre === nombre && v.talle === talle && v.color === color);
  await pedido(clienteIds[0], diasAtras(2), [
    { variante: buscar('Remera Básica Negra', 'S', 'Negro'), cantidad: 1 },
    { variante: buscar('Jean Recto', '40', 'Azul'), cantidad: 1 },
  ]);
  await pedido(clienteIds[1], diasAtras(1), [
    { variante: buscar('Championes Running', '42', 'Negro'), cantidad: 1 },
    { variante: buscar('Lentes de Sol Clásicos', 'Único', 'Carey'), cantidad: 1 },
  ]);
}
