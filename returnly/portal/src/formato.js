// Formatos para MOSTRAR números y fechas en pantalla (capa de presentación).
// Los cálculos de negocio no están acá: los hace el backend (returnly/backend/src/negocio) y llegan listos.
export const num = (n) => Math.round(n).toLocaleString('es-UY')
export const compacto = (n) => new Intl.NumberFormat('es-UY', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
export const usd = (n) => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const pct = (x, decimales = 1) => `${(x * 100).toLocaleString('es-UY', { maximumFractionDigits: decimales })} %`
export const fechaCorta = (d) => d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// El backend manda las fechas como { __fecha: 'AAAA-MM-DD' }: acá se vuelven fechas de JavaScript (en la zona
// horaria de quien mira, así el día no se corre)
export function conFechas(valor) {
  if (Array.isArray(valor)) return valor.map(conFechas)
  if (valor && typeof valor === 'object') {
    if (typeof valor.__fecha === 'string') {
      const [a, m, d] = valor.__fecha.split('-').map(Number)
      return new Date(a, m - 1, d)
    }
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, conFechas(v)]))
  }
  return valor
}
