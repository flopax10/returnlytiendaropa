// Trae los datos de una empresa desde BigQuery usando SU clave (según el tipo de fuente que tenga: GA4,
// TheLook...) y los guarda en caché para no gastar cuota en cada visita al panel.
import { BigQuery } from '@google-cloud/bigquery';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fuenteDe } from './fuentes/index.js';
import { credencialDe } from './empresas.js';

const VIGENCIA_MS = 24 * 3600 * 1000;
// En Vercel solo se puede escribir en /tmp
const CARPETA_CACHE = process.env.VERCEL ? join(tmpdir(), 'returnly-cache') : new URL('../.cache/', import.meta.url);
const enCurso = new Map(); // evita correr las mismas consultas dos veces a la vez

// Cliente de BigQuery con la KEY de la empresa (guardada encriptada en Supabase)
function clienteDe(empresa) {
  const cred = credencialDe(empresa);
  return new BigQuery({ projectId: cred.project_id, credentials: cred });
}

async function consultarBigQuery(empresa) {
  const bq = clienteDe(empresa);
  const { consultas, etiquetas } = fuenteDe(empresa);
  const lista = Object.entries(consultas);
  const resultados = await Promise.all(lista.map(([, query]) => bq.query({ query, location: 'US' }).then(([filas]) => filas)));
  return { ...Object.fromEntries(lista.map(([nombre], i) => [nombre, resultados[i]])), etiquetas };
}

const archivoCache = (empresa) =>
  typeof CARPETA_CACHE === 'string' ? join(CARPETA_CACHE, `${empresa.id}.json`) : new URL(`${empresa.id}.json`, CARPETA_CACHE);

async function leerCache(empresa) {
  try {
    const guardado = JSON.parse(await readFile(archivoCache(empresa), 'utf8'));
    if (Date.now() - guardado.actualizado < VIGENCIA_MS) return guardado;
  } catch {
    // no hay caché o está rota: se consulta de nuevo
  }
  return null;
}

// Devuelve { actualizado, datos } con los resultados de todas las consultas
export async function obtenerDatos(empresa) {
  const cache = await leerCache(empresa);
  if (cache) return cache;
  if (!enCurso.has(empresa.id)) {
    enCurso.set(empresa.id, (async () => {
      const nuevo = { actualizado: Date.now(), datos: await consultarBigQuery(empresa) };
      await mkdir(CARPETA_CACHE, { recursive: true });
      await writeFile(archivoCache(empresa), JSON.stringify(nuevo));
      return nuevo;
    })().finally(() => enCurso.delete(empresa.id)));
  }
  return enCurso.get(empresa.id);
}

// Prueba la conexión de una empresa sin gastar cuota: valida la KEY y las consultas con un "dry run"
export async function probarConexion(empresa) {
  const bq = clienteDe(empresa);
  const { consultas } = fuenteDe(empresa);
  let bytes = 0;
  for (const query of Object.values(consultas)) {
    const [job] = await bq.createQueryJob({ query, location: 'US', dryRun: true });
    bytes += Number(job.metadata.statistics.totalBytesProcessed);
  }
  return { ok: true, gbPorActualizacion: Math.round((bytes / 1024 ** 3) * 10) / 10 };
}

// Borra la caché de una empresa (por ejemplo, al cambiarle la KEY o la fuente)
export async function borrarCache(empresa) {
  const { rm } = await import('node:fs/promises');
  await rm(archivoCache(empresa), { force: true });
}
