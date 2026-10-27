// Fuente "ga4": consultas sobre el export de GA4 de una empresa en BigQuery (tablas events_*).
// Devuelven datos ya resumidos para el panel. Sirven para la tabla de prueba de Google o la de cada empresa.

// Cuántas vistas del mismo producto cuentan como "lo miró varias veces" (curiosidad)
export const etiquetas = { vistasRepetidas: 3 };

export function consultas({ tabla }) {
  const T = `\`${tabla}\``;

  // Id único de sesión: usuario + ga_session_id
  const SESION = `CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING))`;
  const PASOS = `('session_start','view_item_list','select_item','view_item','add_to_cart','begin_checkout','add_shipping_info','add_payment_info','purchase')`;

  // GA4 no guarda el producto igual en cada paso: al verlo la categoría es una ruta ("Home/Apparel/Men's /")
  // y al comprarlo es corta ("Apparel"), y a veces cambia el item_id. Por eso se agrupa por nombre y se le
  // asigna a cada producto una categoría limpia: el tramo principal más común de la ruta en sus vistas
  // (si la ruta empieza con "Home/" se saltea ese primer tramo).
  const PRODUCTO_CTE = `
    WITH base AS (
      SELECT event_name, user_pseudo_id, it.item_name AS producto, it.item_category AS cat,
        it.quantity AS cantidad, it.item_revenue_in_usd AS ingreso, it.price_in_usd AS precio
      FROM ${T}, UNNEST(items) AS it
      WHERE event_name IN ('view_item', 'add_to_cart', 'purchase')
        AND it.item_name IS NOT NULL AND it.item_name != '(not set)'),
    cat AS (
      SELECT producto, APPROX_TOP_COUNT(tramo, 1)[OFFSET(0)].value AS categoria
      FROM (
        SELECT producto, NULLIF(TRIM(SPLIT(cat, '/')[SAFE_OFFSET(IF(STARTS_WITH(cat, 'Home/'), 1, 0))]), '') AS tramo
        FROM base WHERE event_name = 'view_item')
      WHERE tramo IS NOT NULL
      GROUP BY producto),
    ev AS (
      SELECT base.*, IFNULL(cat.categoria, '(sin categoría)') AS categoria
      FROM base LEFT JOIN cat USING (producto))`;

  return {
    // Números generales del período
    resumen: `
      SELECT MIN(event_date) AS desde, MAX(event_date) AS hasta,
        COUNT(DISTINCT user_pseudo_id) AS usuarios,
        COUNT(DISTINCT ${SESION}) AS sesiones,
        COUNTIF(event_name = 'page_view') AS paginas_vistas,
        COUNT(DISTINCT IF(event_name = 'purchase', ecommerce.transaction_id, NULL)) AS compras,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS compradores,
        ROUND(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue_in_usd, 0)), 2) AS ingresos_usd
      FROM ${T}`,

    // Cantidad de cada tipo de evento
    eventos: `
      SELECT event_name AS evento, COUNT(*) AS cantidad, COUNT(DISTINCT user_pseudo_id) AS usuarios
      FROM ${T} GROUP BY evento ORDER BY cantidad DESC`,

    // Embudo de compra: usuarios que llegaron a cada paso
    embudo: `
      SELECT event_name AS paso, COUNT(DISTINCT user_pseudo_id) AS usuarios, COUNT(DISTINCT ${SESION}) AS sesiones
      FROM ${T} WHERE event_name IN ${PASOS}
      GROUP BY paso ORDER BY usuarios DESC`,

    // Mismo embudo, mes a mes
    embudo_por_mes: `
      SELECT SUBSTR(event_date, 1, 6) AS mes, event_name AS paso, COUNT(DISTINCT user_pseudo_id) AS usuarios
      FROM ${T} WHERE event_name IN ${PASOS}
      GROUP BY mes, paso ORDER BY mes, usuarios DESC`,

    // Evolución diaria
    diario: `
      SELECT event_date AS fecha,
        COUNT(DISTINCT user_pseudo_id) AS usuarios,
        COUNT(DISTINCT ${SESION}) AS sesiones,
        COUNTIF(event_name = 'page_view') AS paginas_vistas,
        COUNT(DISTINCT IF(event_name = 'view_item', user_pseudo_id, NULL)) AS vieron_producto,
        COUNT(DISTINCT IF(event_name = 'add_to_cart', user_pseudo_id, NULL)) AS agregaron_carrito,
        COUNT(DISTINCT IF(event_name = 'begin_checkout', user_pseudo_id, NULL)) AS iniciaron_checkout,
        COUNT(DISTINCT IF(event_name = 'purchase', ecommerce.transaction_id, NULL)) AS compras,
        ROUND(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue_in_usd, 0)), 2) AS ingresos_usd
      FROM ${T} GROUP BY fecha ORDER BY fecha`,

    // Comportamiento por producto: vistas -> carrito -> compra
    productos: `
      ${PRODUCTO_CTE}
      SELECT producto, categoria,
        COUNT(DISTINCT IF(event_name = 'view_item', user_pseudo_id, NULL)) AS usuarios_vieron,
        COUNTIF(event_name = 'view_item') AS vistas,
        COUNT(DISTINCT IF(event_name = 'add_to_cart', user_pseudo_id, NULL)) AS usuarios_carrito,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS usuarios_compraron,
        SUM(IF(event_name = 'purchase', cantidad, 0)) AS unidades_vendidas,
        ROUND(SUM(IF(event_name = 'purchase', ingreso, 0)), 2) AS ingresos_usd,
        ROUND(AVG(precio), 2) AS precio_promedio_usd
      FROM ev
      GROUP BY producto, categoria
      HAVING usuarios_vieron > 0
      ORDER BY usuarios_vieron DESC`,

    // Lo mismo agrupado por categoría
    categorias: `
      ${PRODUCTO_CTE}
      SELECT categoria,
        COUNT(DISTINCT producto) AS productos,
        COUNT(DISTINCT IF(event_name = 'view_item', user_pseudo_id, NULL)) AS usuarios_vieron,
        COUNT(DISTINCT IF(event_name = 'add_to_cart', user_pseudo_id, NULL)) AS usuarios_carrito,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS usuarios_compraron,
        SUM(IF(event_name = 'purchase', cantidad, 0)) AS unidades_vendidas,
        ROUND(SUM(IF(event_name = 'purchase', ingreso, 0)), 2) AS ingresos_usd
      FROM ev
      GROUP BY categoria ORDER BY usuarios_vieron DESC`,

    // Conversión por tipo de dispositivo
    dispositivos: `
      SELECT device.category AS dispositivo, device.operating_system AS sistema,
        COUNT(DISTINCT user_pseudo_id) AS usuarios,
        COUNT(DISTINCT IF(event_name = 'add_to_cart', user_pseudo_id, NULL)) AS agregaron_carrito,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS compradores,
        ROUND(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue_in_usd, 0)), 2) AS ingresos_usd
      FROM ${T} GROUP BY dispositivo, sistema ORDER BY usuarios DESC`,

    // De dónde vienen los usuarios (primera fuente) y cuánto compran
    fuentes: `
      SELECT traffic_source.medium AS medio, traffic_source.source AS fuente,
        COUNT(DISTINCT user_pseudo_id) AS usuarios,
        COUNT(DISTINCT IF(event_name = 'add_to_cart', user_pseudo_id, NULL)) AS agregaron_carrito,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS compradores,
        ROUND(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue_in_usd, 0)), 2) AS ingresos_usd
      FROM ${T} GROUP BY medio, fuente ORDER BY usuarios DESC LIMIT 30`,

    // Países
    paises: `
      SELECT geo.country AS pais,
        COUNT(DISTINCT user_pseudo_id) AS usuarios,
        COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS compradores,
        ROUND(SUM(IF(event_name = 'purchase', ecommerce.purchase_revenue_in_usd, 0)), 2) AS ingresos_usd
      FROM ${T} GROUP BY pais ORDER BY usuarios DESC LIMIT 30`,

    // Páginas más vistas
    paginas: `
      SELECT (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS titulo,
        COUNT(*) AS vistas, COUNT(DISTINCT user_pseudo_id) AS usuarios
      FROM ${T} WHERE event_name = 'page_view'
      GROUP BY titulo ORDER BY vistas DESC LIMIT 50`,

    // Abandono: sesiones que agregaron al carrito o empezaron el checkout y no compraron
    abandono: `
      WITH s AS (
        SELECT ${SESION} AS sesion,
          LOGICAL_OR(event_name = 'add_to_cart') AS carrito,
          LOGICAL_OR(event_name = 'begin_checkout') AS checkout,
          LOGICAL_OR(event_name = 'purchase') AS compra
        FROM ${T} GROUP BY sesion)
      SELECT COUNTIF(carrito) AS sesiones_con_carrito,
        COUNTIF(carrito AND NOT compra) AS carrito_sin_compra,
        COUNTIF(checkout) AS sesiones_con_checkout,
        COUNTIF(checkout AND NOT compra) AS checkout_sin_compra,
        COUNTIF(compra) AS sesiones_con_compra
      FROM s`,

    // Actividad por día de la semana y hora (hora UTC)
    dia_hora: `
      SELECT EXTRACT(DAYOFWEEK FROM TIMESTAMP_MICROS(event_timestamp)) AS dia_semana,
        EXTRACT(HOUR FROM TIMESTAMP_MICROS(event_timestamp)) AS hora_utc,
        COUNT(DISTINCT ${SESION}) AS sesiones,
        COUNT(DISTINCT IF(event_name = 'purchase', ecommerce.transaction_id, NULL)) AS compras
      FROM ${T} GROUP BY dia_semana, hora_utc ORDER BY dia_semana, hora_utc`,

    // ---- Para la pantalla de recomendaciones ----

    // "Curiosidad": usuarios que vieron el producto 3+ veces, y de ellos cuántos nunca lo agregaron al carrito.
    // El precio sale del carrito y las compras (en las vistas GA4 no lo trae).
    curiosidad: `
      ${PRODUCTO_CTE},
      por_usuario AS (
        SELECT producto, categoria, user_pseudo_id,
          COUNTIF(event_name = 'view_item') AS vistas, COUNTIF(event_name = 'add_to_cart') AS carritos,
          COUNTIF(event_name = 'purchase') AS compras
        FROM ev GROUP BY producto, categoria, user_pseudo_id),
      precios AS (SELECT producto, AVG(precio) AS precio FROM ev WHERE precio > 0 GROUP BY producto)
      SELECT u.producto, u.categoria,
        COUNTIF(vistas > 0) AS usuarios_vieron,
        COUNTIF(vistas >= 3) AS usuarios_repetidos,
        COUNTIF(vistas >= 3 AND carritos = 0) AS repetidos_sin_carrito,
        COUNTIF(vistas >= 3 AND compras > 0) AS repetidos_compraron,
        ROUND(ANY_VALUE(p.precio), 2) AS precio_usd
      FROM por_usuario u LEFT JOIN precios p USING (producto)
      GROUP BY u.producto, u.categoria
      HAVING usuarios_vieron > 0
      ORDER BY usuarios_repetidos DESC LIMIT 300`,

    // Embudo separado por dispositivo, para ver en cuál se pierden más ventas
    embudo_dispositivo: `
      SELECT device.category AS dispositivo, event_name AS paso, COUNT(DISTINCT user_pseudo_id) AS usuarios
      FROM ${T} WHERE event_name IN ${PASOS}
      GROUP BY dispositivo, paso`,
  };
}
