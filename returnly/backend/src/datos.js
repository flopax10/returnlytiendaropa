// Trae los datos de una empresa desde BigQuery usando SU clave (según el tipo de fuente que tenga: GA4,
// TheLook...) y guarda una foto en Supabase (tabla datos_empresa). Esa foto se renueva sola todos los días
// (Vercel Cron -> /api/cron/actualizar) o cuando el admin toca "Actualizar ahora". El panel lee la foto.
import { BigQuery } from '@google-cloud/bigquery';
import { fuenteDe } from './fuentes/index.js';
import { credencialDe, listarEmpresas } from './empresas.js';
import { db, q } from './db.js';

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
  // JSON ida y vuelta: convierte fechas y números de BigQuery a valores simples para guardarlos en jsonb
  return JSON.parse(JSON.stringify({ ...Object.fromEntries(lista.map(([nombre], i) => [nombre, resultados[i]])), etiquetas }));
}

const fotoDe = async (empresa) =>
  (await q(db.from('datos_empresa').select('datos, actualizado').eq('empresa_id', empresa.id).limit(1)))[0];

// Consulta BigQuery y guarda la foto nueva. Si falla, se conserva la foto anterior y se anota el error.
export function actualizarDatos(empresa) {
  if (!enCurso.has(empresa.id)) {
    enCurso.set(empresa.id, (async () => {
      const ahora = new Date().toISOString();
      try {
        const datos = await consultarBigQuery(empresa);
        await q(db.from('datos_empresa').upsert({ empresa_id: empresa.id, datos, actualizado: ahora, ultimo_intento: ahora, error: null }));
        return { actualizado: Date.parse(ahora), datos };
      } catch (e) {
        await q(db.from('datos_empresa').upsert({ empresa_id: empresa.id, ultimo_intento: ahora, error: e.message.slice(0, 500) }));
        throw e;
      }
    })().finally(() => enCurso.delete(empresa.id)));
  }
  return enCurso.get(empresa.id);
}

// Devuelve { actualizado, datos } para el panel. Si la empresa todavía no tiene foto, la trae en el momento.
export async function obtenerDatos(empresa) {
  const foto = await fotoDe(empresa);
  if (foto?.datos) return { actualizado: Date.parse(foto.actualizado), datos: foto.datos };
  return actualizarDatos(empresa);
}

// Actualiza todas las empresas activas con KEY cargada (lo llama el cron diario). Una que falla no frena al resto.
export async function actualizarTodas() {
  const empresas = (await listarEmpresas()).filter((e) => e.activa && e.credencial_cifrada);
  const resultados = await Promise.allSettled(empresas.map(actualizarDatos));
  return empresas.map((e, i) => ({
    empresa: e.id,
    ok: resultados[i].status === 'fulfilled',
    ...(resultados[i].status === 'rejected' && { error: resultados[i].reason.message }),
  }));
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

// Borra la foto de una empresa (por ejemplo, al cambiarle la KEY o la fuente): la próxima visita la trae de nuevo
export async function borrarCache(empresa) {
  await q(db.from('datos_empresa').delete().eq('empresa_id', empresa.id));
}
