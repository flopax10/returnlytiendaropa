// Fuente "thelook": tienda de ropa ficticia que Google publica en BigQuery (bigquery-public-data.thelook_ecommerce).
// No está en formato GA4: tiene sus propias tablas (events, orders, order_items, products, users). Estas consultas
// devuelven los MISMOS datos y nombres de columna que las de GA4, así el panel no cambia.
//
// Cómo se traduce:
// - Período: los últimos 90 días hasta ayer (el dataset se actualiza todos los días).
// - Visitante: user_id si inició sesión; si no, cada sesión cuenta como un visitante.
// - Embudo: department -> view_item_list, product -> view_item, cart -> add_to_cart, purchase -> purchase.
//   No hay pasos de checkout (envío / pago).
// - El evento "cart" no dice qué producto es: se toma el último producto que vio en esa sesión.
// - Compras e ingresos salen de orders / order_items, sin los cancelados.
// - Dispositivo: no existe, se usa el navegador. Fuente de tráfico: traffic_source (sin "medio").

export const etiquetas = { dispositivo: 'navegador' };

export function consultas({ dataset }) {
  const D = (tabla) => `\`${dataset}.${tabla}\``;
  const RANGO = `created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)) AND created_at < TIMESTAMP(CURRENT_DATE())`;
  const EV = `(SELECT *, COALESCE(CAST(user_id AS STRING), session_id) AS visitante FROM ${D('events')} WHERE ${RANGO})`;
  const PEDIDOS = `(SELECT * FROM ${D('orders')} WHERE ${RANGO} AND status != 'Cancelled')`;
  const ITEMS = `(SELECT * FROM ${D('order_items')} WHERE ${RANGO} AND status != 'Cancelled')`;
  const DIA = (col = 'created_at') => `FORMAT_DATE('%Y%m%d', DATE(${col}))`;

  // Cada evento con el producto que el visitante tenía "en pantalla" (para atribuirle el carrito)
  const CON_PRODUCTO = `
    WITH ev AS (
      SELECT visitante, session_id, sequence_number, event_type,
        SAFE_CAST(REGEXP_EXTRACT(uri, r'^/product/(\\d+)') AS INT64) AS pid
      FROM ${EV}),
    conprod AS (
      SELECT visitante, event_type,
        LAST_VALUE(pid IGNORE NULLS) OVER (PARTITION BY session_id ORDER BY sequence_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS pid
      FROM ev),
    vistas AS (
      SELECT pid,
        COUNT(DISTINCT IF(event_type = 'product', visitante, NULL)) AS usuarios_vieron,
        COUNTIF(event_type = 'product') AS vistas,
        COUNT(DISTINCT IF(event_type = 'cart', visitante, NULL)) AS usuarios_carrito
      FROM conprod WHERE pid IS NOT NULL GROUP BY pid),
    ventas AS (
      SELECT product_id AS pid, COUNT(DISTINCT user_id) AS usuarios_compraron,
        COUNT(*) AS unidades_vendidas, SUM(sale_price) AS ingresos
      FROM ${ITEMS} GROUP BY pid),
    prod AS (
      SELECT p.name AS producto, p.category AS categoria, p.retail_price AS precio, v.*,
        IFNULL(s.usuarios_compraron, 0) AS usuarios_compraron,
        IFNULL(s.unidades_vendidas, 0) AS unidades_vendidas, IFNULL(s.ingresos, 0) AS ingresos
      FROM vistas v JOIN ${D('products')} p ON p.id = v.pid LEFT JOIN ventas s USING (pid))`;

  // Atributo del visitante que compró (navegador, fuente) tomado de su evento de compra, para repartir ingresos
  const POR_ATRIBUTO = (col, nombre) => `
    WITH comprador AS (
      SELECT user_id, ANY_VALUE(${col}) AS valor FROM ${EV} WHERE event_type = 'purchase' GROUP BY user_id),
    ingresos AS (
      SELECT c.valor, SUM(i.sale_price) AS ingresos FROM ${ITEMS} i JOIN comprador c USING (user_id) GROUP BY c.valor)
    SELECT e.${col} AS ${nombre},
      COUNT(DISTINCT e.visitante) AS usuarios,
      COUNT(DISTINCT IF(e.event_type = 'cart', e.visitante, NULL)) AS agregaron_carrito,
      COUNT(DISTINCT IF(e.event_type = 'purchase', e.visitante, NULL)) AS compradores,
      ROUND(IFNULL(ANY_VALUE(g.ingresos), 0), 2) AS ingresos_usd
    FROM ${EV} e LEFT JOIN ingresos g ON g.valor = e.${col}
    GROUP BY ${nombre} ORDER BY usuarios DESC`;

  return {
    resumen: `
      SELECT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)) AS desde,
        FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)) AS hasta,
        (SELECT COUNT(DISTINCT visitante) FROM ${EV}) AS usuarios,
        (SELECT COUNT(DISTINCT session_id) FROM ${EV}) AS sesiones,
        (SELECT COUNTIF(event_type IN ('home', 'department', 'product')) FROM ${EV}) AS paginas_vistas,
        (SELECT COUNT(*) FROM ${PEDIDOS}) AS compras,
        (SELECT COUNT(DISTINCT user_id) FROM ${PEDIDOS}) AS compradores,
        (SELECT ROUND(SUM(sale_price), 2) FROM ${ITEMS}) AS ingresos_usd`,

    embudo: `
      SELECT paso, COUNT(DISTINCT visitante) AS usuarios, COUNT(DISTINCT session_id) AS sesiones
      FROM (
        SELECT visitante, session_id, CASE event_type
          WHEN 'department' THEN 'view_item_list' WHEN 'product' THEN 'view_item'
          WHEN 'cart' THEN 'add_to_cart' WHEN 'purchase' THEN 'purchase' END AS paso
        FROM ${EV})
      WHERE paso IS NOT NULL GROUP BY paso ORDER BY usuarios DESC`,

    diario: `
      WITH e AS (
        SELECT ${DIA()} AS fecha, COUNT(DISTINCT visitante) AS usuarios, COUNT(DISTINCT session_id) AS sesiones,
          COUNTIF(event_type IN ('home', 'department', 'product')) AS paginas_vistas,
          COUNT(DISTINCT IF(event_type = 'product', visitante, NULL)) AS vieron_producto,
          COUNT(DISTINCT IF(event_type = 'cart', visitante, NULL)) AS agregaron_carrito
        FROM ${EV} GROUP BY fecha),
      o AS (SELECT ${DIA()} AS fecha, COUNT(*) AS compras FROM ${PEDIDOS} GROUP BY fecha),
      i AS (SELECT ${DIA()} AS fecha, ROUND(SUM(sale_price), 2) AS ingresos_usd FROM ${ITEMS} GROUP BY fecha)
      SELECT e.*, IFNULL(o.compras, 0) AS compras, IFNULL(i.ingresos_usd, 0) AS ingresos_usd
      FROM e LEFT JOIN o USING (fecha) LEFT JOIN i USING (fecha) ORDER BY fecha`,

    productos: `${CON_PRODUCTO}
      SELECT producto, categoria, usuarios_vieron, vistas, usuarios_carrito, usuarios_compraron, unidades_vendidas,
        ROUND(ingresos, 2) AS ingresos_usd, ROUND(precio, 2) AS precio_promedio_usd
      FROM prod ORDER BY usuarios_vieron DESC LIMIT 500`,

    categorias: `${CON_PRODUCTO}
      SELECT categoria, COUNT(*) AS productos, SUM(usuarios_vieron) AS usuarios_vieron, SUM(usuarios_carrito) AS usuarios_carrito,
        SUM(usuarios_compraron) AS usuarios_compraron, SUM(unidades_vendidas) AS unidades_vendidas, ROUND(SUM(ingresos), 2) AS ingresos_usd
      FROM prod GROUP BY categoria ORDER BY usuarios_vieron DESC`,

    abandono: `
      SELECT COUNTIF(carrito) AS sesiones_con_carrito, COUNTIF(carrito AND NOT compra) AS carrito_sin_compra,
        0 AS sesiones_con_checkout, 0 AS checkout_sin_compra, COUNTIF(compra) AS sesiones_con_compra
      FROM (
        SELECT session_id, LOGICAL_OR(event_type = 'cart') AS carrito, LOGICAL_OR(event_type = 'purchase') AS compra
        FROM ${EV} GROUP BY session_id)`,

    dispositivos: POR_ATRIBUTO('browser', 'dispositivo'),

    fuentes: POR_ATRIBUTO('traffic_source', 'fuente'),

    paises: `
      WITH ingresos AS (
        SELECT u.country AS pais, SUM(i.sale_price) AS ingresos FROM ${ITEMS} i JOIN ${D('users')} u ON u.id = i.user_id GROUP BY pais)
      SELECT u.country AS pais, COUNT(DISTINCT e.user_id) AS usuarios,
        COUNT(DISTINCT IF(e.event_type = 'purchase', e.user_id, NULL)) AS compradores,
        ROUND(IFNULL(ANY_VALUE(g.ingresos), 0), 2) AS ingresos_usd
      FROM ${EV} e JOIN ${D('users')} u ON u.id = e.user_id LEFT JOIN ingresos g ON g.pais = u.country
      GROUP BY pais ORDER BY usuarios DESC LIMIT 30`,

    dia_hora: `
      SELECT EXTRACT(DAYOFWEEK FROM created_at) AS dia_semana, EXTRACT(HOUR FROM created_at) AS hora_utc,
        COUNT(DISTINCT session_id) AS sesiones, COUNTIF(event_type = 'purchase') AS compras
      FROM ${EV} GROUP BY dia_semana, hora_utc ORDER BY dia_semana, hora_utc`,
  };
}
