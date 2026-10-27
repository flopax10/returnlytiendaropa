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

// ---- 7. ¿Qué países traen mucho tráfico pero pocos compradores? ----
function paisesSinCompra(paises, { kpis }) {
  const filas = paises.filter((p) => p.pais && !/not set/i.test(p.pais))
  const total = filas.reduce((s, p) => s + p.usuarios, 0)
  const promedio = div(filas.reduce((s, p) => s + p.compradores, 0), total)
  const conDatos = filas.map((p) => ({
    pais: p.pais,
    usuarios: p.usuarios,
    partVisitas: div(p.usuarios, total),
    compradores: p.compradores,
    conversion: div(p.compradores, p.usuarios),
  }))
  const bajos = conDatos
    .filter((p) => p.usuarios >= total * 0.01 && p.conversion < promedio * 0.95)
    .map((p) => ({ ...p, brecha: 1 - div(p.conversion, promedio) }))
    .sort((a, b) => b.brecha - a.brecha)
    .slice(0, 3)
  const brechaMaxima = bajos.length ? bajos[0].brecha : 0
  const base = { id: 'paises', pregunta: '¿Qué países traen mucho tráfico pero pocos compradores?' }
  const evidencia = {
    titulo: 'Visitas y compradores por país',
    columnas: [
      { titulo: 'País', campo: 'pais' },
      { titulo: 'Visitantes', campo: 'usuarios', formato: num, numero: true },
      { titulo: '% de las visitas', campo: 'partVisitas', formato: (v) => pct(v, 0), numero: true },
      { titulo: 'Compradores', campo: 'compradores', formato: num, numero: true },
      { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
    ],
    filas: [...conDatos].filter((p) => p.usuarios >= total * 0.01).sort((a, b) => a.conversion - b.conversion).slice(0, 10),
  }
  if (!bajos.length) {
    return {
      ...base,
      hallazgo: `Todos los países con tráfico importante compran igual o mejor que el promedio (${pct(promedio, 2)}).`,
      hipotesis: null,
      accion: 'No hace falta cambiar nada por país. Si se abre un mercado nuevo, medir su conversión desde el primer mes.',
      impacto: null,
      evidencia,
    }
  }
  const extra = Math.round(bajos.reduce((s, p) => s + p.usuarios * (promedio - p.conversion), 0))
  return {
    ...base,
    hallazgo: 'Entre los países con tráfico importante, los que menos compran son ' +
      `${bajos.map((p) => `${p.pais} (${pct(p.partVisitas, 1)} de las visitas, convierte ${pct(p.conversion, 2)}, ${pct(p.brecha, 0)} menos que el promedio)`).join(', ')}. ` +
      `El promedio de la tienda es ${pct(promedio, 2)}.` +
      (brechaMaxima < 0.25 ? ' Las diferencias son chicas (menos de un 25 %): es una señal para vigilar más que un problema urgente.' : ''),
    hipotesis: 'Cuando un país mira mucho y compra poco, suele pasar alguna de estas cosas: el envío a ese país es caro, lento o no ' +
      'existe, y la persona lo descubre recién en el checkout; los precios están en otra moneda y no se sabe cuánto se termina ' +
      'pagando (impuestos, aduana); faltan medios de pago locales; o la gente llega por curiosidad (redes, buscadores) sin intención real de comprar.',
    accion: 'Mostrar desde la ficha si se envía a ese país, cuánto cuesta y cuánto tarda; mostrar precios en moneda local y sumar ' +
      'medios de pago de ese país. Si no se puede vender ahí, dejar de pagar publicidad en esos países y usar ese presupuesto donde sí se compra.',
    impacto: extra > 0 ? `Si estos países compraran como el promedio: +${num(extra)} compradores (≈ ${usd(extra * kpis.ticket)}).` : null,
    evidencia,
  }
}

// ---- 8. ¿Qué páginas de entrada se asocian con más compras? ----
function paginasEntrada(landing, { kpis }) {
  // El carrito, el login o el checkout no son páginas de entrada reales: es gente que vuelve a terminar algo
  const noEsEntrada = /cart|carrito|checkout|log ?in|sign ?in|account|cuenta/i
  const filas = landing.filter((l) => l.pagina !== '(sin dato)' && !noEsEntrada.test(l.pagina)).map((l) => ({
    pagina: l.pagina,
    sesiones: l.sesiones,
    compras: l.sesiones_con_compra,
    ingresos: l.ingresos_usd,
    conversion: div(l.sesiones_con_compra, l.sesiones),
  }))
  if (filas.length < 3) return null
  const total = filas.reduce((s, l) => s + l.sesiones, 0)
  const promedio = div(filas.reduce((s, l) => s + l.compras, 0), total)
  const relevantes = filas.filter((l) => l.sesiones >= total * 0.01)
  const mejor = relevantes.reduce((m, l) => (l.conversion > m.conversion ? l : m))
  const errores = filas.filter((l) => /unavailable|not found|404|error/i.test(l.pagina))
  const peores = relevantes
    .filter((l) => l.conversion < promedio * 0.4 && !errores.includes(l))
    .sort((a, b) => b.sesiones - a.sesiones)
    .slice(0, 3)
  const conIngresos = filas.some((l) => l.ingresos > 0)
  const visitasError = errores.reduce((s, l) => s + l.sesiones, 0)
  const extra = Math.round(peores.reduce((s, l) => s + l.sesiones * (promedio - l.conversion), 0))

  return {
    id: 'entrada',
    pregunta: '¿Qué páginas de entrada se asocian con más compras?',
    hallazgo: `Quienes entran por "${mejor.pagina}" compran en el ${pct(mejor.conversion)} de las visitas, ` +
      `${(div(mejor.conversion, promedio)).toLocaleString('es-UY', { maximumFractionDigits: 1 })} veces el promedio (${pct(promedio)}). ` +
      (peores.length
        ? `En cambio, ${peores.map((l) => `"${l.pagina}" (${num(l.sesiones)} visitas, ${pct(l.conversion, 2)})`).join(', ')} reciben mucha gente y casi no venden.`
        : '') +
      (visitasError ? ` Además, ${num(visitasError)} visitas entraron directo a una página de error: son links rotos que llevan a la tienda.` : ''),
    hipotesis: 'Las páginas que venden bien muestran productos y precios desde el primer momento y dejan la compra a pocos clics. ' +
      'Las que no venden suelen recibir gente desde un anuncio, un link o una publicación que promete algo que la página no muestra ' +
      '(por ejemplo, un producto agotado o una página sin productos), y la persona se va.',
    accion: `Mandar los anuncios, mails y posteos a "${mejor.pagina}". ` +
      (peores.length ? `En ${peores.map((l) => `"${l.pagina}"`).join(' y ')}, agregar productos destacados, precio y un botón de compra visible, o redirigir ese tráfico a una página que venda. ` : '') +
      (visitasError ? 'Encontrar y arreglar (o redirigir) los links que llevan a la página de error.' : ''),
    impacto: extra > 0 ? `Si esas páginas vendieran como el promedio: +${num(extra)} compras (≈ ${usd(extra * kpis.ticket)}).` : null,
    evidencia: {
      titulo: 'Páginas por donde entra la gente',
      columnas: [
        { titulo: 'Página de entrada', campo: 'pagina' },
        { titulo: 'Visitas', campo: 'sesiones', formato: num, numero: true },
        { titulo: 'Visitas con compra', campo: 'compras', formato: num, numero: true },
        { titulo: '% que compra', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
        ...(conIngresos ? [{ titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true }] : []),
      ],
      filas: [...relevantes].sort((a, b) => b.sesiones - a.sesiones).slice(0, 12),
    },
  }
}

// ---- 9. ¿Conviene atraer clientes nuevos o volver a traer a los que ya vinieron? ----
function nuevosVsVuelven(segmentos) {
  const nuevo = segmentos.find((s) => s.segmento === 'nuevo')
  const vuelve = segmentos.find((s) => s.segmento === 'vuelve')
  if (!nuevo || !vuelve) return null
  const calc = (s) => ({
    usuarios: s.usuarios,
    compradores: s.compradores,
    conversion: div(s.compradores, s.usuarios),
    gastoComprador: div(s.ingresos_usd, s.compradores),
    valorVisitante: div(s.ingresos_usd, s.usuarios),
    recompran: div(s.recompran, s.compradores),
  })
  const n = calc(nuevo)
  const v = calc(vuelve)
  const veces = div(v.conversion, n.conversion)
  const recompraTotal = div(nuevo.recompran + vuelve.recompran, nuevo.compradores + vuelve.compradores)
  const partNuevos = div(n.usuarios, n.usuarios + v.usuarios)
  const vuelvenRinden = v.conversion > n.conversion * 1.3
  const extra = Math.round(n.usuarios * 0.1 * Math.max(v.conversion - n.conversion, 0))

  return {
    id: 'nuevos',
    pregunta: '¿Conviene atraer clientes nuevos o volver a traer a los que ya vinieron?',
    hallazgo: `Los visitantes que ya conocían la tienda compran el ${pct(v.conversion, 1)} de las veces, contra el ${pct(n.conversion, 1)} ` +
      `de los nuevos (${veces.toLocaleString('es-UY', { maximumFractionDigits: 1 })} veces más), y gastan ${usd(v.gastoComprador)} por comprador ` +
      `contra ${usd(n.gastoComprador)}. Cada visitante que vuelve deja en promedio ${usd(v.valorVisitante)}; uno nuevo, ${usd(n.valorVisitante)}. ` +
      `El ${pct(partNuevos, 0)} del tráfico son visitantes nuevos, y el ${pct(recompraTotal, 0)} de los compradores compró más de una vez.`,
    hipotesis: 'Quien vuelve ya conoce la marca y confía en la tienda, y muchas veces viene a terminar una compra que pensó antes. ' +
      'El visitante nuevo, en cambio, todavía está comparando precios y opciones.',
    accion: vuelvenRinden
      ? 'Invertir en volver a traer a quien ya visitó: anuncios de remarketing para quienes vieron productos, mails de carrito abandonado ' +
        'y de novedades, y un beneficio para la segunda compra (cupón o envío gratis). Sin dejar de atraer nuevos, que son la mayor parte del tráfico.'
      : 'Los nuevos compran casi igual que los que vuelven: priorizar atraer clientes nuevos (publicidad, redes, alianzas) y cuidar que la primera compra sea fácil.',
    impacto: extra > 0
      ? `Si 1 de cada 10 visitantes nuevos volviera y comprara como los que vuelven: ≈ +${num(extra)} compradores (≈ ${usd(extra * v.gastoComprador)}).`
      : null,
    evidencia: {
      titulo: 'Visitantes nuevos contra los que ya conocían la tienda',
      columnas: [
        { titulo: 'Tipo de visitante', campo: 'tipo' },
        { titulo: 'Visitantes', campo: 'usuarios', formato: num, numero: true },
        { titulo: 'Compradores', campo: 'compradores', formato: num, numero: true },
        { titulo: 'Conversión', campo: 'conversion', formato: (x) => pct(x, 2), numero: true },
        { titulo: 'Gasto por comprador', campo: 'gastoComprador', formato: usd, numero: true },
        { titulo: 'Compraron 2+ veces', campo: 'recompran', formato: (x) => pct(x, 0), numero: true },
      ],
      filas: [{ tipo: 'Nuevos', ...n }, { tipo: 'Ya conocían la tienda', ...v }],
    },
  }
}

// ---- 10. ¿En qué días o meses aumenta la intención de compra? ----
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function cuandoCompran(diario, diaHora) {
  if (!diaHora.length) return null
  // BigQuery: 1 = domingo ... 7 = sábado. Se ordena de lunes a domingo.
  const dias = DIAS_LARGOS.map((nombre, i) => {
    const bq = i === 6 ? 1 : i + 2
    const filas = diaHora.filter((x) => x.dia_semana === bq)
    const sesiones = filas.reduce((s, x) => s + x.sesiones, 0)
    const compras = filas.reduce((s, x) => s + x.compras, 0)
    return { periodo: nombre[0].toUpperCase() + nombre.slice(1), nombre, sesiones, compras, tasa: div(compras, sesiones) }
  })
  const mejorDia = dias.reduce((m, d) => (d.tasa > m.tasa ? d : m))
  const peorDia = dias.reduce((m, d) => (d.tasa < m.tasa ? d : m))
  const finde = dias.slice(5)
  const semana = dias.slice(0, 5)
  const tasaFinde = div(finde.reduce((s, d) => s + d.compras, 0), finde.reduce((s, d) => s + d.sesiones, 0))
  const tasaSemana = div(semana.reduce((s, d) => s + d.compras, 0), semana.reduce((s, d) => s + d.sesiones, 0))

  // Meses con al menos 15 días de datos
  const porMes = {}
  for (const d of diario) {
    const k = d.fecha.slice(0, 6)
    porMes[k] ??= { sesiones: 0, compras: 0, dias: 0 }
    porMes[k].sesiones += d.sesiones
    porMes[k].compras += d.compras
    porMes[k].dias += 1
  }
  const meses = Object.entries(porMes).filter(([, m]) => m.dias >= 15).map(([k, m]) => {
    const nombre = `${MESES[Number(k.slice(4, 6)) - 1]} ${k.slice(0, 4)}`
    return { periodo: `Mes: ${nombre}`, nombre, mes: Number(k.slice(4, 6)), ...m, tasa: div(m.compras, m.sesiones) }
  })
  const mejorMes = meses.length > 1 ? meses.reduce((m, x) => (x.tasa > m.tasa ? x : m)) : null

  const hipotesis = [
    tasaSemana > tasaFinde * 1.1
      ? 'De lunes a viernes la gente compra en ratos libres y desde la computadora (más cómodo para pagar); el fin de semana navega más desde el celular pero decide menos.'
      : tasaFinde > tasaSemana * 1.1
        ? 'El fin de semana la gente tiene más tiempo para mirar con calma y terminar la compra.'
        : 'La intención de compra es bastante pareja en la semana: no depende tanto del día.',
    mejorMes && [11, 12].includes(mejorMes.mes) ? `En ${mejorMes.nombre.split(' ')[0]} pesan Black Friday y las compras para las fiestas.` : '',
  ].filter(Boolean).join(' ')

  return {
    id: 'cuando',
    pregunta: '¿En qué días o meses aumenta la intención de compra?',
    hallazgo: `La intención de compra (compras cada 100 visitas) es más alta los ${mejorDia.nombre} (${(mejorDia.tasa * 100).toLocaleString('es-UY', { maximumFractionDigits: 2 })}) ` +
      `y más baja los ${peorDia.nombre} (${(peorDia.tasa * 100).toLocaleString('es-UY', { maximumFractionDigits: 2 })}). ` +
      (mejorMes ? `Entre los meses analizados, ${mejorMes.nombre} fue el de mayor intención de compra.` : ''),
    hipotesis,
    accion: `Concentrar promociones, mails y presupuesto de anuncios en los ${mejorDia.nombre}` +
      (mejorMes ? ` y prepararse para ${mejorMes.nombre.split(' ')[0]} (stock y campañas con anticipación)` : '') +
      `. En los ${peorDia.nombre}, probar "ofertas del día" o envío gratis para activar la compra.`,
    impacto: null,
    evidencia: {
      titulo: 'Compras cada 100 visitas, por día de la semana y por mes',
      columnas: [
        { titulo: 'Día / mes', campo: 'periodo' },
        { titulo: 'Visitas', campo: 'sesiones', formato: num, numero: true },
        { titulo: 'Compras', campo: 'compras', formato: num, numero: true },
        { titulo: 'Compras cada 100 visitas', campo: 'tasa', formato: (x) => (x * 100).toLocaleString('es-UY', { maximumFractionDigits: 2 }), numero: true },
      ],
      filas: [...dias, ...meses],
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
    paginasEntrada(datos.landing ?? [], metricas),
    canales(metricas),
    paisesSinCompra(datos.paises ?? [], metricas),
    nuevosVsVuelven(datos.segmentos ?? []),
    cuandoCompran(datos.diario ?? [], datos.dia_hora ?? []),
    precios(prods),
  ].filter(Boolean)
}
