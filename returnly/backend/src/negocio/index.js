// Capa de negocio del panel: a partir de los datos de BigQuery de una empresa calcula las métricas y las
// recomendaciones, y las deja listas para mandar al portal (que solo las muestra, sin calcular nada).
import { calcularMetricas } from './metricas.js';
import { calcularRecomendaciones } from './recomendaciones.js';

// Las fechas viajan como { __fecha: 'AAAA-MM-DD' } (sin hora), para que el portal las arme en su zona horaria
// sin que el día se corra. Todo lo demás pasa tal cual.
const dosDigitos = (n) => String(n).padStart(2, '0');
function aEnviar(valor) {
  if (valor instanceof Date) return { __fecha: `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}` };
  if (Array.isArray(valor)) return valor.map(aEnviar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, aEnviar(v)]));
  return valor;
}

// Las tablas de "datos que lo respaldan" se mandan ya formateadas: cada fila trae el texto que se muestra.
function evidenciaFormateada({ titulo, columnas, filas }) {
  return {
    titulo,
    columnas: columnas.map(({ formato, ...c }) => c),
    filas: filas.map((f) => Object.fromEntries(columnas.map((c) => [c.campo, c.formato ? c.formato(f[c.campo]) : f[c.campo]]))),
  };
}

export function panelDeEmpresa(datos) {
  const metricas = calcularMetricas(datos);
  const recomendaciones = calcularRecomendaciones(datos, metricas)
    .map(({ webNombres, ...r }) => (r.evidencia ? { ...r, evidencia: evidenciaFormateada(r.evidencia) } : r));
  return { metricas: aEnviar(metricas), recomendaciones: aEnviar(recomendaciones) };
}
