// Rutas de la pantalla Admin de seguridad (solo usuarios con rol "admin").
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { requiereSesion, requiereAdmin, hashPassword } from './auth.js';
import {
  listarEmpresas, empresaPorId, crearEmpresa, actualizarEmpresa, guardarCredencial, publicaEmpresa,
  listarUsuarios, usuarioPorId, crearUsuario, actualizarUsuario, listarAccesos,
} from './empresas.js';
import { probarConexion, borrarCache } from './datos.js';
import { TIPOS } from './fuentes/index.js';

export const adminRouter = Router();
adminRouter.use(requiereSesion, requiereAdmin);

const error = (res, status, mensaje) => res.status(status).json({ error: mensaje });

// Contraseña temporal legible (sin letras que se confunden). Se muestra una sola vez al admin.
export function passwordTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...randomBytes(14)].map((b) => letras[b % letras.length]).join('');
}

// Valida que sea el .json de una cuenta de servicio de Google
function validarCredencial(json) {
  const ok = json && typeof json === 'object' && json.type === 'service_account' &&
    typeof json.project_id === 'string' && typeof json.client_email === 'string' &&
    typeof json.private_key === 'string' && json.private_key.includes('PRIVATE KEY');
  return ok ? null : 'No es un archivo de cuenta de servicio de Google válido (.json con type "service_account")';
}

// Valida la configuración de la fuente según su tipo
function validarFuente(fuente_tipo, fuente_config) {
  const tipo = TIPOS[fuente_tipo];
  if (!tipo) return `Tipo de fuente desconocido: ${fuente_tipo}`;
  for (const { campo } of tipo.campos) {
    const valor = fuente_config?.[campo];
    // proyecto.dataset[.tabla*]: solo letras, números, guiones, guiones bajos, puntos y *
    if (typeof valor !== 'string' || !/^[\w-]+\.[\w-]+(\.[\w*-]+)?$/.test(valor)) return `Completá "${campo}" con el formato correcto`;
  }
  return null;
}

// ---- Tipos de fuente (para el formulario) ----

adminRouter.get('/fuentes', (_req, res) => {
  res.json(Object.entries(TIPOS).map(([id, t]) => ({ id, nombre: t.nombre, campos: t.campos })));
});

// ---- Empresas ----

adminRouter.get('/empresas', async (_req, res) => {
  res.json((await listarEmpresas()).map(publicaEmpresa));
});

adminRouter.post('/empresas', async (req, res) => {
  const { id, nombre, fuente_tipo, fuente_config, nota } = req.body ?? {};
  if (!/^[a-z0-9-]{2,40}$/.test(id ?? '')) return error(res, 400, 'El identificador va en minúsculas, números y guiones (2 a 40)');
  if (!nombre?.trim()) return error(res, 400, 'Falta el nombre de la empresa');
  const problema = validarFuente(fuente_tipo, fuente_config);
  if (problema) return error(res, 400, problema);
  if (await empresaPorId(id)) return error(res, 409, 'Ya existe una empresa con ese identificador');
  const empresa = await crearEmpresa({ id, nombre: nombre.trim(), fuente_tipo, fuente_config, nota: nota?.trim() || null });
  res.status(201).json(publicaEmpresa(empresa));
});

adminRouter.patch('/empresas/:id', async (req, res) => {
  const empresa = await empresaPorId(req.params.id);
  if (!empresa) return error(res, 404, 'Empresa no encontrada');
  const cambios = {};
  const { nombre, nota, activa, fuente_tipo, fuente_config } = req.body ?? {};
  if (nombre !== undefined) {
    if (!String(nombre).trim()) return error(res, 400, 'El nombre no puede quedar vacío');
    cambios.nombre = String(nombre).trim();
  }
  if (nota !== undefined) cambios.nota = String(nota).trim() || null;
  if (activa !== undefined) cambios.activa = Boolean(activa);
  if (fuente_tipo !== undefined || fuente_config !== undefined) {
    const tipo = fuente_tipo ?? empresa.fuente_tipo;
    const config = fuente_config ?? empresa.fuente_config;
    const problema = validarFuente(tipo, config);
    if (problema) return error(res, 400, problema);
    Object.assign(cambios, { fuente_tipo: tipo, fuente_config: config });
  }
  const actualizada = await actualizarEmpresa(empresa.id, cambios);
  if (cambios.fuente_tipo) await borrarCache(empresa);
  res.json(publicaEmpresa(actualizada));
});

// Carga o reemplaza la KEY de Google de la empresa (se guarda encriptada) y prueba la conexión
adminRouter.put('/empresas/:id/credencial', async (req, res) => {
  const empresa = await empresaPorId(req.params.id);
  if (!empresa) return error(res, 404, 'Empresa no encontrada');
  const problema = validarCredencial(req.body);
  if (problema) return error(res, 400, problema);
  const actualizada = await guardarCredencial(empresa.id, req.body);
  await borrarCache(empresa);
  let prueba;
  try {
    prueba = await probarConexion(actualizada);
  } catch (e) {
    prueba = { ok: false, error: e.message };
  }
  res.json({ empresa: publicaEmpresa(actualizada), prueba });
});

adminRouter.post('/empresas/:id/probar', async (req, res) => {
  const empresa = await empresaPorId(req.params.id);
  if (!empresa) return error(res, 404, 'Empresa no encontrada');
  try {
    res.json(await probarConexion(empresa));
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Usuarios ----

adminRouter.get('/usuarios', async (_req, res) => {
  res.json(await listarUsuarios());
});

// Crea el usuario con una contraseña temporal que se devuelve UNA vez para pasársela a la persona
adminRouter.post('/usuarios', async (req, res) => {
  const { usuario, nombre, rol, empresa_id } = req.body ?? {};
  if (!/^[a-z0-9._-]{3,40}$/.test(String(usuario ?? '').trim().toLowerCase())) {
    return error(res, 400, 'El usuario va en minúsculas, números, puntos o guiones (3 a 40)');
  }
  if (!nombre?.trim()) return error(res, 400, 'Falta el nombre');
  if (!['admin', 'cliente'].includes(rol)) return error(res, 400, 'El rol es admin o cliente');
  if (rol === 'cliente' && !(await empresaPorId(empresa_id))) return error(res, 400, 'Elegí la empresa del cliente');
  const password = passwordTemporal();
  try {
    const nuevo = await crearUsuario({ usuario, nombre: nombre.trim(), rol, empresa_id, password_hash: hashPassword(password) });
    res.status(201).json({ usuario: nuevo, passwordTemporal: password });
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return error(res, 409, 'Ya existe ese usuario');
    throw e;
  }
});

adminRouter.patch('/usuarios/:id', async (req, res) => {
  const usuario = await usuarioPorId(req.params.id);
  if (!usuario) return error(res, 404, 'Usuario no encontrado');
  const { activo, nombre } = req.body ?? {};
  if (usuario.id === req.usuario.id && activo === false) return error(res, 400, 'No te podés bloquear a vos mismo');
  const cambios = {};
  if (activo !== undefined) cambios.activo = Boolean(activo);
  if (nombre !== undefined && String(nombre).trim()) cambios.nombre = String(nombre).trim();
  res.json(await actualizarUsuario(usuario.id, cambios));
});

// Resetea la contraseña: genera una temporal nueva y la devuelve UNA vez
adminRouter.post('/usuarios/:id/resetear-password', async (req, res) => {
  const usuario = await usuarioPorId(req.params.id);
  if (!usuario) return error(res, 404, 'Usuario no encontrado');
  const password = passwordTemporal();
  await actualizarUsuario(usuario.id, { password_hash: hashPassword(password) });
  res.json({ passwordTemporal: password });
});

// ---- Registro de accesos ----

adminRouter.get('/accesos', async (_req, res) => {
  res.json(await listarAccesos(200));
});
