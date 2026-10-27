import { api } from './api.js'

// "Cómo se veía en la web": para un producto, categoría o página de entrada, busca su dirección en los datos
// (tabla urls_paginas, por título de página) y arma el link y la miniatura de cómo se veía en el período
// analizado, usando el Internet Archive (web.archive.org). Las miniaturas las genera s.wordpress.com/mshots.
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.']

export function crearBuscadorWeb(datos, periodo) {
  const filas = datos.urls_paginas ?? []
  if (!filas.length) return null
  const porTitulo = new Map(filas.map((f) => [f.titulo.trim().toLowerCase(), f.url]))

  // Fecha del medio del período: el Archive redirige a la copia guardada más cercana
  const medio = new Date((periodo.desde.getTime() + periodo.hasta.getTime()) / 2)
  const fecha = `${medio.getFullYear()}${String(medio.getMonth() + 1).padStart(2, '0')}${String(medio.getDate()).padStart(2, '0')}`
  const fechaTexto = `${MESES[medio.getMonth()]} ${medio.getFullYear()}`

  return (nombre) => {
    if (!nombre) return null
    const clave = nombre.trim().toLowerCase()
    // Producto o página: título exacto. Categoría: título que empieza con "Categoría |" (ej. "Apparel | Tienda")
    const url = porTitulo.get(clave) ?? filas.find((f) => f.titulo.trim().toLowerCase().startsWith(`${clave} |`))?.url
    if (!url) return null
    return { etiqueta: nombre, url, fecha, fechaTexto }
  }
}

// Pide al backend la copia guardada en el Internet Archive más cercana al período (null si no hay ninguna)
export async function buscarCopia(item, empresaId) {
  const { timestamp: ts } = await api(`/web-copia?empresa=${encodeURIComponent(empresaId)}&url=${encodeURIComponent(item.url)}`)
  if (!ts) return null
  return {
    fechaTexto: `${MESES[Number(ts.slice(4, 6)) - 1]} ${ts.slice(0, 4)}`,
    archivo: `https://web.archive.org/web/${ts}/${item.url}`,
    miniatura: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(`https://web.archive.org/web/${ts}if_/${item.url}`)}?w=640&h=480`,
  }
}
