# Backend de Returnly

Login, dashboards de cada empresa y pantalla **Admin de seguridad**. Cada empresa ve solo sus datos, que el
backend consulta en BigQuery con **su** KEY de Google. La KEY se guarda encriptada y nunca llega al navegador.

```
Panel (returnly/portal) ──/api──> este backend ──> Supabase (empresas, usuarios, accesos)
                                              └──> BigQuery con la KEY de cada empresa (GA4 / TheLook)
```

## Cómo levantarlo

```bash
cp .env.example .env     # completá SESSION_SECRET, SUPABASE_SECRET_KEY y CREDENCIALES_KEY
npm install
npm start                # http://localhost:3002
```

Después levantá el panel (`returnly/portal`, `npm run dev`) y entrá a http://localhost:5174.

## Roles

| Rol | Qué ve |
|---|---|
| `admin` (Returnly) | Pantalla Admin de seguridad: empresas, KEY de Google, usuarios y registro de accesos. Puede abrir el panel de cualquier empresa |
| `cliente` (empresa) | Solo los dashboards de **su** empresa. Puede cambiar su contraseña |

## Datos en Supabase

Tablas `empresa`, `usuario` y `acceso` (SQL en `returnly/supabase/003_empresas_usuarios_accesos.sql`).
Tienen RLS activado **sin políticas** y sin permisos para los roles públicos: con la clave publicable no se
pueden leer. Solo este backend accede, con la clave secreta (`SUPABASE_SECRET_KEY`).

- **KEY de Google:** se guarda encriptada con AES-256-GCM. La clave para desencriptar (`CREDENCIALES_KEY`) vive
  solo en el servidor. Si se pierde, hay que volver a cargar las KEY desde el admin.
- **Contraseñas:** hasheadas con scrypt. Las contraseñas nuevas o reseteadas las genera el sistema y se muestran
  una sola vez al admin.
- **Bajas lógicas:** empresas y usuarios no se borran: se dan de baja / se bloquean (se conserva el historial).

## Fuentes de datos

| Empresa | Usuario | `fuente_tipo` | Datos |
|---|---|---|---|
| Google Merchandise Store | `google` | `ga4` | Export GA4 de prueba de Google (nov-2020 a ene-2021) |
| TheLook (tienda de ropa) | `thelook` | `thelook` | Tienda de ropa simulada de Google, últimos 90 días |

Cada tipo está en `src/fuentes/` y devuelve las mismas consultas (mismos nombres y columnas), así el panel
funciona igual para todas. `ga4` sirve para cualquier empresa con GA4 exportado a BigQuery: alcanza con crearla
desde el admin y cargarle su KEY. Un formato nuevo = un archivo nuevo en `src/fuentes/`.

## Seguridad

- Sesión en cookie **httpOnly** firmada (8 horas). En cada pedido se verifica que el usuario siga activo: si el
  admin lo bloquea, pierde el acceso al instante.
- Freno a la fuerza bruta: 10 intentos fallidos por IP cada 15 minutos.
- Cada intento de ingreso (bueno o fallido, con motivo, IP y navegador) queda en la tabla `acceso`.
- El cliente nunca puede pedir datos de otra empresa: el backend usa siempre la empresa de su usuario.

## Datos y costo

- La primera vez que se abre el panel de una empresa se corren sus consultas (unos 8 GB para Google, 1,5 GB
  para TheLook). El resultado queda en caché 24 horas (`.cache/`).
- `npm run estimar` calcula cuánto leería cada empresa sin gastar cuota (lo mismo que "Probar conexión" en el admin).

## API

| Método | Ruta | Quién | Para qué |
|---|---|---|---|
| POST | `/api/login` | todos | Inicia sesión |
| POST | `/api/logout` | todos | Cierra la sesión |
| GET | `/api/sesion` | logueado | Usuario y empresa de la sesión |
| POST | `/api/cambiar-password` | logueado | Cambia la propia contraseña (pide la actual) |
| GET | `/api/datos` | logueado | Datos de su empresa (el admin elige con `?empresa=id`) |
| GET/POST/PATCH | `/api/admin/empresas` | admin | Listar, crear, editar, dar de baja empresas |
| PUT | `/api/admin/empresas/:id/credencial` | admin | Cargar o reemplazar la KEY (se encripta y se prueba) |
| POST | `/api/admin/empresas/:id/probar` | admin | Probar la conexión sin gastar cuota |
| GET/POST/PATCH | `/api/admin/usuarios` | admin | Listar, crear, bloquear usuarios |
| POST | `/api/admin/usuarios/:id/resetear-password` | admin | Generar una contraseña temporal nueva |
| GET | `/api/admin/accesos` | admin | Registro de los últimos 200 ingresos |
