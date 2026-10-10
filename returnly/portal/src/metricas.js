// Métricas del panel: se calculan a partir de los datos GA4 que manda el backend (/api/datos).

// ---- Formatos ----
export const num = (n) => Math.round(n).toLocaleString('es-UY')
export const compacto = (n) => new Intl.NumberFormat('es-UY', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
export const usd = (n) => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const pct = (x, decimales = 1) => `${(x * 100).toLocaleString('es-UY', { maximumFractionDigits: decimales })} %`
const div = (a, b) => (b ? a / b : 0)
const aFecha = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
export const fechaCorta = (d) => d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })

// Nombres que vienen ofuscados por Google en el dataset de prueba
const limpiar = (s) => ({ '<Other>': 'Otros', '(data deleted)': 'Dato borrado', '(none)': 'ninguno', '(direct)': 'directo' }[s] ?? s)

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function calcularMetricas(datos) {
  const { resumen, embudo, diario, productos, categorias, abandono, dispositivos, fuentes, paises, dia_hora: diaHora } = datos

  // ---- Resumen ----
  const r = resumen[0]
  const periodo = { desde: aFecha(r.desde), hasta: aFecha(r.hasta) }
  const kpis = {
    usuarios: r.usuarios,
    sesiones: r.sesiones,
    compras: r.compras,
    ingresos: r.ingresos_usd,
    conversion: div(r.compradores, r.usuarios),
    ticket: div(r.ingresos_usd, r.compras),
  }

  // ---- Evolución diaria ----
  const dias = diario.map((d) => ({
    fecha: aFecha(d.fecha),
    usuarios: d.usuarios,
    sesiones: d.sesiones,
    compras: d.compras,
    ingresos: d.ingresos_usd,
  }))

  // ---- Embudo (usuarios únicos que llegaron a cada paso) ----
  const PASOS = [
    ['view_item', 'Vieron un producto'],
    ['add_to_cart', 'Agregaron al carrito'],
    ['begin_checkout', 'Iniciaron el checkout'],
    ['add_shipping_info', 'Cargaron el envío'],
    ['add_payment_info', 'Cargaron el pago'],
    ['purchase', 'Compraron'],
  ]
  const usuariosPaso = Object.fromEntries(embudo.map((e) => [e.paso, e.usuarios]))
  // Solo los pasos que la fuente registra (por ejemplo, TheLook no tiene pasos de checkout)
  const pasosPresentes = PASOS.filter(([clave]) => clave in usuariosPaso)
  const pasosEmbudo = pasosPresentes.map(([clave, nombre], i) => {
    const usuarios = usuariosPaso[clave]
    const anterior = i ? usuariosPaso[pasosPresentes[i - 1][0]] : usuarios
    return { clave, nombre, usuarios, delTotal: div(usuarios, usuariosPaso.view_item), delAnterior: div(usuarios, anterior) }
  })

  // ---- Abandono ----
  const a = abandono[0]
  const tasaAbandono = {
    carrito: div(a.carrito_sin_compra, a.sesiones_con_carrito),
    carritoSesiones: a.sesiones_con_carrito,
    carritoSinCompra: a.carrito_sin_compra,
    checkout: div(a.checkout_sin_compra, a.sesiones_con_checkout),
    checkoutSesiones: a.sesiones_con_checkout,
  }

  // ---- Productos ----
  const prods = productos.map((p) => ({
    producto: p.producto,
    categoria: p.categoria,
    vieron: p.usuarios_vieron,
    carrito: p.usuarios_carrito,
    compraron: p.usuarios_compraron,
    ingresos: p.ingresos_usd,
    aCarrito: div(p.usuarios_carrito, p.usuarios_vieron),
    conversion: div(p.usuarios_compraron, p.usuarios_vieron),
    cierre: div(p.usuarios_compraron, p.usuarios_carrito),
  }))

  // Qué revisar según en qué paso se pierde a la gente
  function sugerencia(p) {
    if (p.aCarrito < 0.15) return 'Lo miran pero no lo agregan: revisá fotos, precio y descripción.'
    if (p.cierre < 0.05) return 'Lo agregan pero no lo compran: revisá costo de envío, talles y stock.'
    return 'Convierte poco: probá destacarlo con una oferta o reseñas.'
  }

  // Mucho interés y poca compra: los más vistos (top 40) con menor conversión
  const oportunidades = [...prods]
    .sort((x, y) => y.vieron - x.vieron).slice(0, 40)
    .sort((x, y) => x.conversion - y.conversion).slice(0, 8)
    .map((p) => ({ ...p, sugerencia: sugerencia(p) }))

  // Los que mejor convierten entre los más vistos (top 40)
  const destacados = [...prods]
    .sort((x, y) => y.vieron - x.vieron).slice(0, 40)
    .sort((x, y) => y.conversion - x.conversion).slice(0, 5)

  // ---- Categorías (por ingresos) ----
  const porCategoria = categorias
    .filter((c) => c.usuarios_vieron >= 100)
    .map((c) => ({
      categoria: c.categoria,
      ingresos: c.ingresos_usd,
      vieron: c.usuarios_vieron,
      compraron: c.usuarios_compraron,
      conversion: div(c.usuarios_compraron, c.usuarios_vieron),
    }))
    .sort((x, y) => y.ingresos - x.ingresos)

  // ---- Dispositivos (agrupa los sistemas operativos) ----
  const NOMBRE_DISPOSITIVO = { desktop: 'Computadora', mobile: 'Celular', tablet: 'Tablet' }
  const porDispositivo = Object.values(dispositivos.reduce((acc, d) => {
    const k = d.dispositivo
    acc[k] ??= { dispositivo: NOMBRE_DISPOSITIVO[k] ?? k, usuarios: 0, compradores: 0, ingresos: 0 }
    acc[k].usuarios += d.usuarios
    acc[k].compradores += d.compradores
    acc[k].ingresos += d.ingresos_usd
    return acc
  }, {})).map((d) => ({ ...d, conversion: div(d.compradores, d.usuarios) }))
    .sort((x, y) => y.usuarios - x.usuarios)

  // ---- Fuentes de tráfico ----
  const porFuente = fuentes
    .filter((f) => f.usuarios >= 100)
    .map((f) => ({
      fuente: f.medio ? `${limpiar(f.fuente)} / ${limpiar(f.medio)}` : limpiar(f.fuente),
      usuarios: f.usuarios,
      compradores: f.compradores,
      ingresos: f.ingresos_usd,
      conversion: div(f.compradores, f.usuarios),
    }))

  // ---- Países ----
  const porPais = paises.slice(0, 10).map((p) => ({
    pais: p.pais,
    usuarios: p.usuarios,
    compradores: p.compradores,
    ingresos: p.ingresos_usd,
    conversion: div(p.compradores, p.usuarios),
  }))

  // ---- Actividad por día y hora (UTC) ----
  // BigQuery: 1 = domingo ... 7 = sábado. Se muestra de lunes a domingo.
  const grillaHoraria = DIAS_SEMANA.map((_, i) => {
    const diaBq = i === 6 ? 1 : i + 2
    return Array.from({ length: 24 }, (_, h) => diaHora.find((x) => x.dia_semana === diaBq && x.hora_utc === h)?.sesiones ?? 0)
  })

  // ---- Sugerencias generales (reglas sobre los datos) ----
  function sugerenciasGenerales() {
    const lista = []
    lista.push({
      titulo: `${pct(tasaAbandono.carrito, 0)} de los carritos se abandonan`,
      detalle: `De ${num(tasaAbandono.carritoSesiones)} sesiones que agregaron algo al carrito, ` +
        `${num(tasaAbandono.carritoSinCompra)} no compraron. ` +
        'Probá recordatorios de carrito por email y mostrar el costo de envío antes del checkout.',
    })

    // Mayor caída del embudo: dentro del checkout si la fuente lo registra, si no en todo el embudo
    const desdeCheckout = pasosEmbudo.findIndex((p) => p.clave === 'begin_checkout')
    const tramo = desdeCheckout >= 0 ? pasosEmbudo.slice(desdeCheckout) : pasosEmbudo
    if (tramo.length >= 2) {
      const peor = tramo.slice(1).reduce((p, c) => (c.delAnterior < p.delAnterior ? c : p))
      const previo = tramo[tramo.indexOf(peor) - 1]
      lista.push({
        titulo: `La mayor fuga ${desdeCheckout >= 0 ? 'del checkout' : 'del embudo'} es entre "${previo.nombre.toLowerCase()}" y "${peor.nombre.toLowerCase()}"`,
        detalle: `Solo ${pct(peor.delAnterior, 0)} de los que ${previo.nombre.toLowerCase()} siguieron. ` +
          (peor.clave === 'add_to_cart'
            ? 'Revisá fotos, talles, precio y descripción de los productos.'
            : peor.clave === 'purchase' && desdeCheckout < 0
              ? 'Revisá costo de envío, medios de pago y que el checkout sea corto.'
              : 'Revisá los medios de pago disponibles y que el formulario sea corto.'),
      })
    }

    const compu = porDispositivo.find((d) => d.dispositivo === 'Computadora')
    const celu = porDispositivo.find((d) => d.dispositivo === 'Celular')
    if (compu && celu) {
      const brecha = 1 - div(celu.conversion, compu.conversion)
      lista.push(brecha > 0.1
        ? { titulo: `En celular se convierte ${pct(brecha, 0)} menos que en computadora`,
            detalle: 'Revisá la experiencia mobile: velocidad, tamaño de botones y pasos del checkout.' }
        : { titulo: 'Celular y computadora convierten parecido',
            detalle: `${pct(celu.conversion)} en celular contra ${pct(compu.conversion)} en computadora: la experiencia mobile acompaña.` })
    }

    const o = oportunidades[0]
    lista.push({
      titulo: `"${o.producto}" atrae mucho y vende poco`,
      detalle: `Lo vieron ${num(o.vieron)} usuarios y solo ${num(o.compraron)} ${o.compraron === 1 ? 'lo compró' : 'lo compraron'} (${pct(o.conversion)}). ${o.sugerencia}`,
    })
    return lista
  }
  const sugerencias = sugerenciasGenerales()

  // Nombre de la dimensión "dispositivo" (algunas fuentes no lo tienen y usan, por ejemplo, el navegador)
  const etiquetaDispositivo = datos.etiquetas?.dispositivo ?? 'dispositivo'

  return { periodo, kpis, dias, pasosEmbudo, tasaAbandono, oportunidades, destacados, porCategoria, porDispositivo, porFuente, porPais, grillaHoraria, sugerencias, etiquetaDispositivo }
}
