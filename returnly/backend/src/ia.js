// Feedback adaptado con IA: toma las recomendaciones que el panel ya calculó con los datos de la empresa
// y le pide a Gemini (Google, nivel gratuito) que las adapte al rubro y al negocio de esa empresa.
// La IA NO calcula números: solo reescribe y prioriza lo que ya salió de los datos.
// Si falta la clave, Gemini falla o se pasa del límite gratis, el panel muestra las recomendaciones de siempre.
import { createHash } from 'node:crypto';
import { db, q } from './db.js';

const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const URL_GEMINI = (modelo) => `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
// Subir este número cuando cambia el pedido a la IA, así se descarta lo guardado
const VERSION_PROMPT = 1;

export const iaDisponible = () => Boolean(process.env.GEMINI_API_KEY);

// Solo los campos de texto que la IA necesita, recortados (no se mandan tablas ni datos crudos)
const recortar = (t, max = 700) => (typeof t === 'string' ? t.slice(0, max) : null);
function limpiar(recomendaciones) {
  if (!Array.isArray(recomendaciones)) return [];
  return recomendaciones.slice(0, 12).map((r) => ({
    id: recortar(r?.id, 40),
    pregunta: recortar(r?.pregunta, 200),
    hallazgo: recortar(r?.hallazgo),
    hipotesis: recortar(r?.hipotesis),
    accion: recortar(r?.accion),
    impacto: recortar(r?.impacto, 300),
  })).filter((r) => r.id && r.hallazgo);
}

function armarPedido(empresa, recomendaciones) {
  return `Sos consultor de e-commerce de Returnly. Tu cliente es esta empresa:
- Nombre: ${empresa.nombre}
- Sitio web: ${empresa.web ?? 'no informado'}
- Sobre sus datos: ${empresa.nota ?? 'sin nota'}

A partir del comportamiento de sus clientes, nuestro sistema ya calculó estas recomendaciones (JSON):
${JSON.stringify(recomendaciones)}

Tu tarea es adaptarlas a ESTE negocio en particular (su rubro, sus productos, su tipo de cliente):
1. "resumen": 2 o 3 oraciones con el diagnóstico general de la tienda, hablándole directo al dueño ("tu tienda...").
2. "prioridades": los ids de las 3 recomendaciones más importantes para este negocio, de la más a la menos urgente.
3. "recomendaciones": para cada id recibido, una "accion" reescrita: 2 o 3 pasos concretos y realistas para
   este rubro (no genéricos), y un "porque" de una oración que explique por qué importa para este negocio.

Reglas: español rioplatense, claro y sin jerga técnica. No inventes números, porcentajes ni datos que no estén
en el JSON. Si la nota dice que los datos son simulados o tienen huecos, tenelo en cuenta y no saques
conclusiones de eso. Usá exactamente los mismos ids que recibiste.`;
}

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    prioridades: { type: 'ARRAY', items: { type: 'STRING' } },
    recomendaciones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, accion: { type: 'STRING' }, porque: { type: 'STRING' } },
        required: ['id', 'accion', 'porque'],
      },
    },
  },
  required: ['resumen', 'prioridades', 'recomendaciones'],
};

async function preguntarAGemini(pedido) {
  const res = await fetch(URL_GEMINI(MODELO), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: pedido }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw Object.assign(new Error(`Gemini ${res.status}: ${detalle.slice(0, 300)}`), { status: res.status });
  }
  const json = await res.json();
  const texto = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(texto);
}

// Se queda solo con lo que corresponde a ids que existen (por si la IA devuelve algo de más)
function validar(respuesta, ids) {
  const validos = new Set(ids);
  const porId = {};
  for (const r of respuesta?.recomendaciones ?? []) {
    if (validos.has(r?.id) && r.accion) porId[r.id] = { accion: String(r.accion), porque: r.porque ? String(r.porque) : null };
  }
  return {
    resumen: respuesta?.resumen ? String(respuesta.resumen) : null,
    prioridades: (respuesta?.prioridades ?? []).filter((id) => validos.has(id)).slice(0, 3),
    porId,
  };
}

const enCurso = new Map(); // si dos personas abren el panel a la vez, se le pregunta a la IA una sola vez

// Devuelve { resumen, prioridades, porId, modelo, creado_en } (desde la caché o recién generado)
export async function feedbackConIA(empresa, recomendacionesCrudas) {
  const recomendaciones = limpiar(recomendacionesCrudas);
  if (!recomendaciones.length) throw Object.assign(new Error('No hay recomendaciones para adaptar'), { status: 400 });

  const huella = createHash('sha256')
    .update(JSON.stringify({ v: VERSION_PROMPT, m: MODELO, n: empresa.nombre, nota: empresa.nota, web: empresa.web, recomendaciones }))
    .digest('hex');

  const guardado = (await q(db.from('feedback_ia').select('contenido, modelo, creado_en')
    .eq('empresa_id', empresa.id).eq('huella', huella).limit(1)))[0];
  if (guardado) return { ...guardado.contenido, modelo: guardado.modelo, creado_en: guardado.creado_en };

  const clave = `${empresa.id}:${huella}`;
  if (!enCurso.has(clave)) {
    enCurso.set(clave, (async () => {
      const respuesta = await preguntarAGemini(armarPedido(empresa, recomendaciones));
      const contenido = validar(respuesta, recomendaciones.map((r) => r.id));
      const fila = (await q(db.from('feedback_ia')
        .upsert({ empresa_id: empresa.id, huella, modelo: MODELO, contenido })
        .select('creado_en')))[0];
      return { ...contenido, modelo: MODELO, creado_en: fila?.creado_en };
    })().finally(() => enCurso.delete(clave)));
  }
  return enCurso.get(clave);
}
