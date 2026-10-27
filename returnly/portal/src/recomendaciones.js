// Recomendaciones "bajadas a tierra": cada una responde una pregunta del negocio con un hallazgo concreto,
// qué hacer y un impacto estimado. Se calculan con los mismos datos del panel (backend /api/datos) más dos
// consultas extra: curiosidad por producto y embudo por dispositivo.
import { num, usd, pct } from './metricas.js'

const div = (a, b) => (b ? a / b : 0)
const NOMBRE_DISPOSITIVO = { desktop: 'computadora', mobile: 'celular', tablet: 'tablet' }
const mediana = (lista) => {
  const v = lista.filter((x) => x > 0).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : 0
}

// Qué hacer según el paso del embudo donde se pierde más gente
const ACCION_POR_PASO = {
  add_to_cart: 'Mejorar las fichas de producto: fotos de detalle, guía de talles, precio y disponibilidad bien visibles, y reseñas.',
  begin_checkout: 'Mostrar el costo de envío ya en el carrito y dejar el botón "Finalizar compra" siempre a la vista.',
  add_shipping_info: 'Simplificar el formulario de envío: menos campos, autocompletar la dirección y mostrar los plazos de entrega.',
  add_payment_info: 'Sumar medios de pago (débito, billeteras) y ofrecer cuotas; mostrar sellos de compra segura.',
  purchase: 'Revisar el costo de envío y que el checkout sea corto; mandar un recordatorio a quien dejó el carrito armado.',
}

// ---- 1. ¿Dónde perdemos ventas? ----
function dondePerdemos({ pasosEmbudo, kpis }, embudoDispositivo, etiquetaDispositivo) {
  const peor = pasosEmbudo.slice(1).reduce((p, c) => (c.delAnterior < p.delAnterior ? c : p))
  const previo = pasosEmbudo[pasosEmbudo.indexOf(peor) - 1]

  // Conversión (vio un producto -> compró) por dispositivo
  const porDisp = {}
  for (const f of embudoDispositivo) {
    porDisp[f.dispositivo] ??= {}
    porDisp[f.dispositivo][f.paso] = f.usuarios
  }
  const totalVieron = Object.values(porDisp).reduce((s, d) => s + (d.view_item ?? 0), 0)
  const dispositivos = Object.entries(porDisp)
    .map(([d, p]) => ({
      dispositivo: NOMBRE_DISPOSITIVO[d] ?? d,
      vieron: p.view_item ?? 0,
      compraron: p.purchase ?? 0,
      conversion: div(p.purchase ?? 0, p.view_item ?? 0),
    }))
    .filter((d) => d.vieron >= totalVieron * 0.02)
    .sort((a, b) => b.vieron - a.vieron)
  const mejor = dispositivos.reduce((m, d) => (d.conversion > m.conversion ? d : m), dispositivos[0])
  const rezagado = dispositivos.filter((d) => d !== mejor).reduce((m, d) => (!m || d.vieron * (mejor.conversion - d.conversion) > m.vieron * (mejor.conversion - m.conversion) ? d : m), null)
  const brecha = rezagado ? 1 - div(rezagado.conversion, mejor.conversion) : 0

  let hallazgo = `El paso donde más gente abandona es entre "${previo.nombre.toLowerCase()}" y "${peor.nombre.toLowerCase()}": ` +
    `de ${num(previo.usuarios)} personas solo siguieron ${num(peor.usuarios)} (${pct(peor.delAnterior, 0)}).`
  let accion = ACCION_POR_PASO[peor.clave] ?? ACCION_POR_PASO.purchase
  let impacto = null
  if (rezagado && brecha > 0.1) {
    const extra = Math.round(rezagado.vieron * (mejor.conversion - rezagado.conversion))
    hallazgo += ` Además, en ${rezagado.dispositivo} compra el ${pct(rezagado.conversion)} de los que ven un producto, ` +
      `contra ${pct(mejor.conversion)} en ${mejor.dispositivo} (${pct(brecha, 0)} menos).`
    accion += ` Y revisar la experiencia en ${rezagado.dispositivo}: velocidad, tamaño de botones y pasos de compra.`
    impacto = `Si ${rezagado.dispositivo} convirtiera como ${mejor.dispositivo}: +${num(extra)} compras ` +
      `(≈ ${usd(extra * kpis.ticket)} con el ticket promedio de ${usd(kpis.ticket)}).`
  } else {
    // 5 % de los que abandonan siguen, y de ellos compra la misma proporción que hoy compra después de ese paso
    const abandonan = previo.usuarios - peor.usuarios
    const extra = Math.round(abandonan * 0.05 * div(kpis.compras, peor.usuarios))
    if (dispositivos.length > 1) hallazgo += ` La conversión es parecida en todos los ${etiquetaDispositivo === 'dispositivo' ? 'dispositivos' : 'navegadores'}: el problema no es de uno en particular.`
    impacto = `Si 5 de cada 100 de los que hoy abandonan en ese paso siguieran: ≈ +${num(extra)} compras (≈ ${usd(extra * kpis.ticket)}).`
  }

  return {
    id: 'perdemos',
    pregunta: '¿Dónde perdemos ventas?',
    hallazgo, accion, impacto,
    evidencia: {
      titulo: `Conversión por ${etiquetaDispositivo}`,
      columnas: [
        { titulo: etiquetaDispositivo[0].toUpperCase() + etiquetaDispositivo.slice(1), campo: 'dispositivo' },
        { titulo: 'Vieron un producto', campo: 'vieron', formato: num, numero: true },
        { titulo: 'Compraron', campo: 'compraron', formato: num, numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
      ],
      filas: dispositivos,
    },
  }
}

// ---- 2. ¿Qué productos generan curiosidad pero no se venden? ----
function curiosidadSinCompra({ pasosEmbudo }, curiosidad, vistasRepetidas) {
  const medianaCategoria = {}
  for (const cat of new Set(curiosidad.map((c) => c.categoria))) {
    medianaCategoria[cat] = mediana(curiosidad.filter((c) => c.categoria === cat).map((c) => c.precio_usd))
  }
  const casos = curiosidad
    .filter((c) => c.usuarios_repetidos >= 10 && div(c.repetidos_sin_carrito, c.usuarios_repetidos) >= 0.4)
    .map((c) => {
      const med = medianaCategoria[c.categoria]
      const sobre = c.precio_usd && med ? c.precio_usd / med - 1 : null
      return {
        producto: c.producto,
        categoria: c.categoria,
        repetidos: c.usuarios_repetidos,
        sinCarrito: c.repetidos_sin_carrito,
        tasa: div(c.repetidos_sin_carrito, c.usuarios_repetidos),
        precio: c.precio_usd,
        sobre,
        lectura: sobre === null ? 'sin dato de precio' : sobre >= 0.2 ? `${pct(sobre, 0)} más caro que su categoría` : 'precio en línea con su categoría',
      }
    })
    .sort((a, b) => b.sinCarrito - a.sinCarrito)
    .slice(0, 6)

  const base = { id: 'curiosidad', pregunta: '¿Qué productos generan curiosidad pero no se venden?' }
  if (!casos.length) {
    return {
      ...base,
      hallazgo: `No encontramos productos que la gente mire ${vistasRepetidas} veces o más sin agregarlos al carrito: los que miran varias veces terminan comprando.`,
      accion: 'No hace falta tocar precios ni fichas por este motivo. Seguir midiéndolo mes a mes.',
      impacto: null,
      evidencia: null,
    }
  }
  const top = casos[0]
  const caros = casos.filter((c) => c.sobre >= 0.2)
  const cierre = div(pasosEmbudo.at(-1).usuarios, pasosEmbudo.find((p) => p.clave === 'add_to_cart')?.usuarios)
  const totalSin = casos.reduce((s, c) => s + c.sinCarrito, 0)
  const extraVentas = Math.round(totalSin * 0.1 * cierre)
  const extraPlata = casos.reduce((s, c) => s + c.sinCarrito * 0.1 * cierre * (c.precio ?? 0), 0)

  return {
    ...base,
    hallazgo: `"${top.producto}" despierta mucho interés pero no cierra: ${num(top.repetidos)} personas lo miraron ` +
      `${vistasRepetidas} veces o más y ${num(top.sinCarrito)} (${pct(top.tasa, 0)}) nunca lo agregaron al carrito. ` +
      (caros.length
        ? `${caros.length} de los ${casos.length} productos de esta lista son más caros que su categoría: el precio puede estar frenando la compra.`
        : 'Sus precios están en línea con su categoría: el freno probablemente esté en la ficha (fotos, talles, descripción) o en el stock.'),
    accion: caros.length
      ? 'En los más caros, probar un descuento acotado, cuotas sin interés o venderlos en combo, y medir si sube el agregado al carrito. En el resto, mejorar fotos, guía de talles y descripción.'
      : 'Mejorar la ficha: fotos de detalle y puesto, guía de talles, descripción clara y disponibilidad por talle.',
    impacto: `Si 1 de cada 10 de estos curiosos lo agregara al carrito: ≈ +${num(extraVentas)} ventas (≈ ${usd(extraPlata)}).`,
    evidencia: {
      titulo: `Productos que se miran ${vistasRepetidas}+ veces y no se agregan al carrito`,
      columnas: [
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Categoría', campo: 'categoria' },
        { titulo: `Lo miraron ${vistasRepetidas}+ veces`, campo: 'repetidos', formato: num, numero: true },
        { titulo: 'Nunca al carrito', campo: 'sinCarrito', formato: num, numero: true },
        { titulo: '%', campo: 'tasa', formato: (v) => pct(v, 0), numero: true },
        { titulo: 'Precio', campo: 'precio', formato: (v) => (v ? usd(v) : '—'), numero: true },
        { titulo: 'Lectura', campo: 'lectura' },
      ],
      filas: casos,
    },
  }
}

// Productos con conversión y precio por unidad (base de las recomendaciones 3, 4 y 6)
function productosConDatos(productos) {
  return productos
    .filter((p) => p.usuarios_vieron > 0)
    .map((p) => ({
      producto: p.producto,
      categoria: p.categoria,
      vieron: p.usuarios_vieron,
      compraron: p.usuarios_compraron,
      unidades: p.unidades_vendidas,
      ingresos: p.ingresos_usd,
      precio: div(p.ingresos_usd, p.unidades_vendidas) || p.precio_promedio_usd || 0,
      conversion: div(p.usuarios_compraron, p.usuarios_vieron),
    }))
}

// ---- 3. ¿Qué destacar en la web? ----
function queDestacar(prods) {
  const promedio = div(prods.reduce((s, p) => s + p.compraron, 0), prods.reduce((s, p) => s + p.vieron, 0))
  const vistas = prods.map((p) => p.vieron).sort((a, b) => a - b)
  const medianaVistas = vistas[Math.floor(vistas.length / 2)]
  const joyas = prods
    .filter((p) => p.compraron >= 3 && p.vieron <= medianaVistas && p.conversion >= promedio * 1.5)
    .sort((a, b) => b.conversion - a.conversion)
    .slice(0, 6)
  const masVistos = [...prods].sort((a, b) => b.vieron - a.vieron).slice(0, 20)
  const bajar = masVistos.filter((p) => p.conversion < promedio * 0.5).slice(0, 3)

  const base = { id: 'destacar', pregunta: '¿Qué destacar en la web?' }
  if (!joyas.length) {
    return { ...base, hallazgo: 'No encontramos productos que conviertan mucho mejor que el promedio y estén poco expuestos.', accion: 'Mantener el orden actual de la vitrina y revisarlo el mes que viene.', impacto: null, evidencia: null }
  }
  const extra = joyas.reduce((s, p) => s + p.ingresos * 0.5, 0)
  return {
    ...base,
    hallazgo: `Hay ${joyas.length} productos que se venden muy bien cuando alguien los ve, pero casi nadie llega a ellos. ` +
      `"${joyas[0].producto}" convierte ${pct(joyas[0].conversion)} (el promedio de la tienda es ${pct(promedio)}) y lo vieron solo ${num(joyas[0].vieron)} personas.` +
      (bajar.length ? ` En cambio, ${bajar.map((p) => `"${p.producto}"`).join(', ')} ocupan mucha vidriera y venden poco.` : ''),
    accion: 'Subir estos productos a la home, a los primeros lugares de su categoría y a los mails y redes. ' +
      (bajar.length ? 'Bajar de los primeros lugares a los que atraen pero no venden, hasta mejorar su ficha o precio.' : ''),
    impacto: `Si estos productos tuvieran un 50 % más de visitas y vendieran igual de bien: ≈ +${usd(extra)} en el período.`,
    evidencia: {
      titulo: 'Productos que convierten bien y están poco expuestos',
      columnas: [
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Categoría', campo: 'categoria' },
        { titulo: 'Lo vieron', campo: 'vieron', formato: num, numero: true },
        { titulo: 'Compraron', campo: 'compraron', formato: num, numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v), numero: true },
      ],
      filas: joyas,
    },
  }
}

// ---- 4. ¿Qué comprar o importar más? ----
function queComprar(prods, { porCategoria }) {
  const promedio = div(prods.reduce((s, p) => s + p.compraron, 0), prods.reduce((s, p) => s + p.vieron, 0))
  const reponer = prods
    .filter((p) => p.unidades > 0 && p.conversion >= promedio)
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 6)
  const totalVieron = porCategoria.reduce((s, c) => s + c.vieron, 0)
  const categorias = porCategoria.filter((c) => c.vieron >= totalVieron * 0.05)
  const catEstrella = categorias.reduce((m, c) => (!m || c.conversion > m.conversion ? c : m), null)
  const noReponer = [...prods].sort((a, b) => b.vieron - a.vieron).slice(0, 40)
    .filter((p) => p.unidades <= 1).slice(0, 3)

  return {
    id: 'comprar',
    pregunta: '¿Qué comprar o importar más?',
    hallazgo: (reponer.length
      ? `Los productos con más demanda real (se venden mucho y convierten por encima del promedio) son ${reponer.slice(0, 3).map((p) => `"${p.producto}"`).join(', ')}. `
      : '') +
      (catEstrella ? `La categoría que mejor convierte es "${catEstrella.categoria}" (${pct(catEstrella.conversion)} de los que la miran compran). ` : '') +
      (noReponer.length ? `En cambio, ${noReponer.map((p) => `"${p.producto}"`).join(', ')} tienen muchas visitas y casi no se venden.` : ''),
    accion: 'Asegurar stock (y talles) de los más vendidos antes de que se agoten, ampliar la variedad en ' +
      (catEstrella ? `"${catEstrella.categoria}"` : 'las categorías que mejor convierten') +
      (noReponer.length ? ' y no reponer los que no se venden hasta revisar su precio o ficha.' : '.'),
    impacto: reponer.length
      ? `Quedarse sin stock de estos productos pone en riesgo ≈ ${usd(reponer.reduce((s, p) => s + p.ingresos, 0))} de ventas del período.`
      : null,
    evidencia: reponer.length ? {
      titulo: 'Productos con más demanda real',
      columnas: [
        { titulo: 'Producto', campo: 'producto' },
        { titulo: 'Categoría', campo: 'categoria' },
        { titulo: 'Unidades vendidas', campo: 'unidades', formato: num, numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v), numero: true },
        { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true },
      ],
      filas: reponer,
    } : null,
  }
}

// ---- 5. ¿Qué canales traen compradores y no solo visitas? ----
function canales({ porFuente, kpis }) {
  const total = porFuente.reduce((s, f) => s + f.usuarios, 0)
  const totalCompradores = porFuente.reduce((s, f) => s + f.compradores, 0)
  const conocidos = porFuente.filter((f) => !/^(Otros|Dato borrado)/.test(f.fuente) && f.usuarios >= total * 0.03)
  const filas = conocidos.map((f) => ({
    ...f,
    partVisitas: div(f.usuarios, total),
    partCompradores: div(f.compradores, totalCompradores),
  }))
  const mejor = filas.reduce((m, f) => (!m || f.conversion > m.conversion ? f : m), null)
  const peor = filas.reduce((m, f) => (!m || f.conversion < m.conversion ? f : m), null)
  const promedio = div(totalCompradores, total)
  const extra = peor ? Math.round(peor.usuarios * Math.max(promedio - peor.conversion, 0)) : 0
  // Solo vale la pena recomendar si el peor canal convierte bastante menos que el promedio
  const hayDiferencia = mejor && peor && mejor !== peor && peor.conversion < promedio * 0.85

  return {
    id: 'canales',
    pregunta: '¿Qué canales traen compradores y no solo visitas?',
    hallazgo: hayDiferencia
      ? `"${mejor.fuente}" es el canal que mejor vende: convierte ${pct(mejor.conversion, 2)}. ` +
        `"${peor.fuente}" trae el ${pct(peor.partVisitas, 0)} de las visitas pero convierte solo ${pct(peor.conversion, 2)} ` +
        `(el promedio es ${pct(promedio, 2)}).`
      : `Todos los canales convierten parecido (el promedio es ${pct(promedio, 2)}): ninguno está trayendo visitas que no compran.`,
    accion: hayDiferencia
      ? `Reforzar "${mejor.fuente}", que trae a los compradores más decididos, y revisar lo que se invierte en "${peor.fuente}": a qué página llega esa gente y si encuentra lo que le prometió el anuncio o el link.`
      : 'Mantener la inversión actual y medir cada campaña por ventas, no solo por visitas.',
    impacto: hayDiferencia && extra > 0 ? `Si "${peor.fuente}" convirtiera como el promedio: +${num(extra)} compras (≈ ${usd(extra * kpis.ticket)}).` : null,
    evidencia: {
      titulo: 'Visitas y compradores por canal',
      columnas: [
        { titulo: 'Canal', campo: 'fuente' },
        { titulo: '% de las visitas', campo: 'partVisitas', formato: (v) => pct(v, 0), numero: true },
        { titulo: '% de los compradores', campo: 'partCompradores', formato: (v) => pct(v, 0), numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
      ],
      filas,
    },
  }
}

// ---- 6. ¿Qué precio funciona mejor? ----
function precios(prods) {
  const conPrecio = prods.filter((p) => p.precio > 0 && p.vieron >= 20).sort((a, b) => a.precio - b.precio)
  if (conPrecio.length < 8) return null
  const cortes = [0.25, 0.5, 0.75].map((q) => conPrecio[Math.floor(conPrecio.length * q)].precio)
  const limites = [0, ...cortes, Infinity]
  const rangos = limites.slice(0, -1).map((desde, i) => {
    const hasta = limites[i + 1]
    const grupo = conPrecio.filter((p) => p.precio >= desde && p.precio < hasta)
    return {
      rango: hasta === Infinity ? `Más de ${usd(desde)}` : `${usd(desde)} a ${usd(hasta)}`,
      productos: grupo.length,
      conversion: div(grupo.reduce((s, p) => s + p.compraron, 0), grupo.reduce((s, p) => s + p.vieron, 0)),
    }
  }).filter((r) => r.productos > 0)
  const mejor = rangos.reduce((m, r) => (r.conversion > m.conversion ? r : m))
  const peor = rangos.reduce((m, r) => (r.conversion < m.conversion ? r : m))
  return {
    id: 'precios',
    pregunta: '¿Qué precio funciona mejor?',
    hallazgo: `Los productos de ${mejor.rango} son los que mejor convierten (${pct(mejor.conversion)}); ` +
      `los de ${peor.rango} son los que menos (${pct(peor.conversion)}).`,
    accion: `Usar los productos de ${mejor.rango} como "gancho" en la home y en promociones. ` +
      `En el rango ${peor.rango}, reforzar con cuotas, envío gratis o combos para bajar la barrera de compra.`,
    impacto: null,
    evidencia: {
      titulo: 'Conversión por rango de precio',
      columnas: [
        { titulo: 'Rango de precio', campo: 'rango' },
        { titulo: 'Productos', campo: 'productos', formato: num, numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v), numero: true },
      ],
      filas: rangos,
    },
  }
}

export function calcularRecomendaciones(datos, metricas) {
  const prods = productosConDatos(datos.productos ?? [])
  const vistasRepetidas = datos.etiquetas?.vistasRepetidas ?? 3
  return [
    dondePerdemos(metricas, datos.embudo_dispositivo ?? [], metricas.etiquetaDispositivo),
    curiosidadSinCompra(metricas, datos.curiosidad ?? [], vistasRepetidas),
    queDestacar(prods),
    queComprar(prods, metricas),
    canales(metricas),
    precios(prods),
  ].filter(Boolean)
}
