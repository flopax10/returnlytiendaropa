// Backend de Returnly: login, datos para los dashboards de cada empresa y pantalla Admin de seguridad.
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { hashPassword, verificarPassword, iniciarSesion, cerrarSesion, requiereSesion } from './auth.js';
import { usuarioParaLogin, actualizarUsuario, empresaPorId, publicaEmpresa, registrarAcceso } from './empresas.js';
import { obtenerDatos } from './datos.js';
import { adminRouter } from './admin.js';
import { responderPregunta, preguntasConfiguradas } from './preguntas.js';

const app = express();
app.set('trust proxy', 1); // en Vercel, para que req.ip sea la IP real
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Lo que el navegador sabe del usuario logueado (sin contraseña) y, si es cliente, de su empresa
async function sesionPublica(usuario) {
  const empresa = usuario.empresa_id ? await empresaPorId(usuario.empresa_id) : null;
  const { id, usuario: nombreUsuario, nombre, rol } = usuario;
  return { usuario: { id, usuario: nombreUsuario, nombre, rol }, empresa: empresa && publicaEmpresa(empresa) };
}

// Freno a la fuerza bruta: hasta 10 intentos fallidos por IP cada 15 minutos
const fallidos = new Map();
const VENTANA_MS = 15 * 60 * 1000;

app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  const registro = fallidos.get(ip);
  if (registro && registro.cantidad >= 10 && Date.now() - registro.desde < VENTANA_MS) {
    return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
  }
  const { usuario: ingresado, password } = req.body ?? {};
  const acceso = { usuario_ingresado: ingresado, ip, user_agent: req.get('user-agent') };
  const usuario = await usuarioParaLogin(ingresado);
  // Se ignoran espacios al principio y al final (pasa mucho al copiar y pegar la contraseña)
  const passwordOk = usuario && verificarPassword(String(password ?? '').trim(), usuario.password_hash);
  const empresa = passwordOk && usuario.empresa_id ? await empresaPorId(usuario.empresa_id) : null;

  let motivo = null;
  if (!usuario) motivo = 'usuario inexistente';
  else if (!passwordOk) motivo = 'contraseña incorrecta';
  else if (!usuario.activo) motivo = 'usuario bloqueado';
  else if (usuario.rol === 'cliente' && !empresa?.activa) motivo = 'empresa dada de baja';

  if (motivo) {
    await registrarAcceso({ ...acceso, usuario_id: usuario?.id ?? null, exito: false, motivo });
    const nuevo = registro && Date.now() - registro.desde < VENTANA_MS ? registro : { cantidad: 0, desde: Date.now() };
    nuevo.cantidad += 1;
    fallidos.set(ip, nuevo);
    // Al que entra no se le dice cuál fue el problema exacto (salvo si ya sabe la contraseña)
    const mensaje = passwordOk ? 'Tu acceso está deshabilitado. Hablá con Returnly.' : 'Usuario o contraseña incorrectos';
    return res.status(401).json({ error: mensaje });
  }

  fallidos.delete(ip);
  await registrarAcceso({ ...acceso, usuario_id: usuario.id, exito: true, motivo: 'ok' });
  iniciarSesion(res, usuario.id);
  res.json(await sesionPublica(usuario));
});

app.post('/api/logout', (_req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

app.get('/api/sesion', requiereSesion, async (req, res) => {
  res.json(await sesionPublica(req.usuario));
});

// Cambiar la propia contraseña (pide la actual)
app.post('/api/cambiar-password', requiereSesion, async (req, res) => {
  const actual = String(req.body?.actual ?? '').trim();
  const nueva = String(req.body?.nueva ?? '').trim();
  if (nueva.length < 10) return res.status(400).json({ error: 'La contraseña nueva tiene que tener al menos 10 caracteres' });
  const completo = await usuarioParaLogin(req.usuario.usuario);
  if (!verificarPassword(actual, completo.password_hash)) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  await actualizarUsuario(req.usuario.id, { password_hash: hashPassword(nueva) });
  res.json({ ok: true });
});

// Datos para los dashboards: el cliente ve los de SU empresa; el admin elige cuál (?empresa=id)
app.get('/api/datos', requiereSesion, async (req, res) => {
  const id = req.usuario.rol === 'admin' ? req.query.empresa : req.usuario.empresa_id;
  const empresa = id && await empresaPorId(String(id));
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (!empresa.activa && req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Tu empresa está dada de baja' });
  const { actualizado, datos } = await obtenerDatos(empresa);
  res.json({ empresa: publicaEmpresa(empresa), actualizado, datos });
});

// "Hacé una pregunta": responde con IA usando SOLO los datos de la empresa (cliente: la suya; admin: ?empresa=id)
const preguntasPorUsuario = new Map(); // freno al gasto: 30 preguntas por hora por usuario
const HORA_MS = 3600 * 1000;

app.post('/api/preguntar', requiereSesion, async (req, res) => {
  const pregunta = String(req.body?.pregunta ?? '').trim();
  if (pregunta.length < 3) return res.status(400).json({ error: 'Escribí una pregunta' });
  if (pregunta.length > 500) return res.status(400).json({ error: 'La pregunta es muy larga (máximo 500 caracteres)' });
  if (!preguntasConfiguradas()) {
    return res.status(503).json({ error: 'Esta función todavía no está configurada (falta la clave de la API de Claude en el servidor).' });
  }

  const id = req.usuario.rol === 'admin' ? req.body?.empresa : req.usuario.empresa_id;
  const empresa = id && await empresaPorId(String(id));
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (!empresa.activa && req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Tu empresa está dada de baja' });

  const ahora = Date.now();
  const recientes = (preguntasPorUsuario.get(req.usuario.id) ?? []).filter((t) => ahora - t < HORA_MS);
  if (recientes.length >= 30) return res.status(429).json({ error: 'Llegaste al límite de 30 preguntas por hora. Probá más tarde.' });
  preguntasPorUsuario.set(req.usuario.id, [...recientes, ahora]);

  try {
    const { datos } = await obtenerDatos(empresa);
    res.json(await responderPregunta(empresa, datos, pregunta));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('Clave de Claude inválida', e.message);
      return res.status(503).json({ error: 'La clave de la API de Claude del servidor no es válida.' });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Hay muchas preguntas en este momento. Probá en un minuto.' });
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Error de la API de Claude', e.status, e.message);
      return res.status(502).json({ error: 'No se pudo obtener la respuesta. Probá de nuevo en un rato.' });
    }
    throw e;
  }
});

app.use('/api/admin', adminRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Algo salió mal. Probá de nuevo en un rato.' });
});

// En Vercel la app corre como función (usa el export); en la compu levanta un servidor normal
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3002);
  app.listen(port, () => console.log(`Backend de Returnly en http://localhost:${port}`));
}

export default app;
