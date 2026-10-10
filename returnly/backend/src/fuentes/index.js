// Tipos de fuente de datos que entiende Returnly. Cada una devuelve las mismas consultas (mismos nombres y
// columnas), así el panel funciona igual para cualquier empresa. Para sumar un formato nuevo, agregalo acá
// (y en el check de la columna empresa.fuente_tipo en Supabase).
import * as ga4 from './ga4.js';
import * as thelook from './thelook.js';

export const TIPOS = {
  ga4: { modulo: ga4, nombre: 'GA4 (export a BigQuery)', campos: [{ campo: 'tabla', ejemplo: 'proyecto.analytics_123456789.events_*' }] },
  thelook: { modulo: thelook, nombre: 'TheLook (dataset público)', campos: [{ campo: 'dataset', ejemplo: 'bigquery-public-data.thelook_ecommerce' }] },
};

export function fuenteDe(empresa) {
  const tipo = TIPOS[empresa.fuente_tipo];
  if (!tipo) throw new Error(`Tipo de fuente desconocido: ${empresa.fuente_tipo}`);
  return { consultas: tipo.modulo.consultas(empresa.fuente_config), etiquetas: tipo.modulo.etiquetas ?? {} };
}
