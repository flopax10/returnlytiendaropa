import { api } from './api.js'

// "Cómo se veía en la web": el backend ya buscó la dirección de cada producto o página (negocio/web.js); acá se
// pide la copia guardada en el Internet Archive (web.archive.org) y se arma el link y la miniatura para mostrar.
// Las miniaturas las genera s.wordpress.com/mshots.
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.']

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
