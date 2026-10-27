// Copias guardadas de páginas en el Internet Archive (web.archive.org), para mostrar en el panel cómo se veía
// en la web un producto, categoría o página de entrada durante el período analizado. Se usa el servicio CDX del
// Archive desde el servidor (el navegador no puede consultarlo directamente) y se guarda la respuesta en memoria.
const encontradas = new Map(); // "url|fecha" -> timestamp de la copia, o null si no hay

// Fecha (AAAAMMDD) del medio del período de los datos
export function fechaMedia(resumen) {
  const r = resumen?.[0];
  if (!r?.desde || !r?.hasta) return null;
  const aFecha = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const medio = new Date((aFecha(r.desde) + aFecha(r.hasta)) / 2);
  return medio.toISOString().slice(0, 10).replaceAll('-', '');
}

// Devuelve el timestamp (AAAAMMDDhhmmss) de la copia HTML con respuesta 200 más cercana a la fecha, o null
export async function copiaMasCercana(url, fecha) {
  const clave = `${url}|${fecha}`;
  if (encontradas.has(clave)) return encontradas.get(clave);
  const consulta = new URLSearchParams({
    url, closest: fecha, sort: 'closest', limit: '1', fl: 'timestamp', output: 'json',
  });
  const r = await fetch(`https://web.archive.org/cdx/search/cdx?${consulta}&filter=statuscode:200&filter=mimetype:text/html`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`El Internet Archive respondió ${r.status}`);
  const filas = await r.json().catch(() => []);
  const timestamp = filas[1]?.[0] ?? null; // la primera fila son los nombres de las columnas
  encontradas.set(clave, timestamp);
  return timestamp;
}
