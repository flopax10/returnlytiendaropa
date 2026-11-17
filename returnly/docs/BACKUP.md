# Backup y disponibilidad de Returnly

Un **backup** es una copia de los datos guardada en otro lugar, para poder recuperarlos si se pierden
(un error humano, un cambio que borra datos, un ataque, que se caiga o se borre el proveedor).
Este documento define **qué se respalda, cada cuánto, dónde, cómo se protege y cómo se recupera** cada pieza de Returnly.

## 1. Qué tan crítica es la plataforma

| Pregunta | Respuesta para Returnly |
|---|---|
| ¿Qué datos propios guarda? | Empresas (y su KEY de Google cifrada), usuarios, registro de accesos, auditoría y seguimiento del feedback. Poco volumen (KB/MB). |
| ¿Mueve dinero o datos de salud? | No. Es una herramienta de análisis B2B. |
| ¿Qué pasa si se pierde la base? | Nadie puede entrar y se pierde el historial de seguridad. Los datos de comportamiento **no** se pierden: viven en el BigQuery de cada empresa. |
| ¿Cuánto puede estar caída? | Unas horas sin impacto grave. |

**Criticidad: media.** Objetivos:

- **RPO** (cuántos datos podemos perder como máximo): **24 horas**, porque hay un backup por día.
- **RTO** (en cuánto tiempo volvemos a funcionar): **menos de 2 horas** siguiendo la sección 5.

## 2. Qué se respalda de cada pieza

| Pieza | Dónde vive | Cómo se respalda |
|---|---|---|
| **Base de datos** (5 tablas) | Supabase (PostgreSQL 17) | **Backup diario automático y cifrado** con GitHub Actions ([`backup-base.yml`](../../.github/workflows/backup-base.yml)), verificado con una restauración de prueba cada vez. Ver sección 3. |
| **Código** (portal, backend, SQL, docs) | GitHub | Git guarda **todas las versiones** y cada integrante tiene una copia completa en su compu. Se puede volver a cualquier versión anterior. |
| **Estructura de la base** | GitHub (`returnly/supabase/*.sql`) | Los scripts SQL, en orden, recrean las tablas, reglas y permisos desde cero. |
| **Secretos** (`SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `CREDENCIALES_KEY`, `BACKUP_PASSWORD`) | Variables de Vercel y secretos de GitHub | En un **gestor de contraseñas** del equipo (ej. Bitwarden), nunca en el repo. ⚠️ Sin `CREDENCIALES_KEY`, las KEY de Google del backup no se pueden descifrar; sin `BACKUP_PASSWORD`, el backup no se puede abrir. |
| **Configuración de Vercel** (dominios, variables, proyectos) | Vercel | Está descrita en el repo (`vercel.json`, `.env.example`, este documento). Se recrea importando el repo en Vercel. |
| **Servidores / VM** | No hay | Returnly no usa máquinas virtuales propias: corre en funciones de Vercel (serverless). No hay disco de servidor que respaldar; si Vercel se cae, se vuelve a publicar el código desde GitHub. |
| **Datos de comportamiento** | BigQuery de cada empresa | No son de Returnly: los respalda cada empresa (Google). Returnly solo los lee. |

## 3. El backup automático de la base

| Característica | Valor |
|---|---|
| **Frecuencia** | Todos los días a las 3:23 (hora de Uruguay), y a mano cuando se quiera (Actions → *Backup de la base* → **Run workflow**). |
| **Qué incluye** | Todo el esquema `public`: tablas, datos, reglas (CHECK, UNIQUE, claves), índices, seguridad (RLS) y permisos. |
| **Herramienta** | `pg_dump` 17, la herramienta oficial de PostgreSQL, en formato *custom* comprimido. |
| **Cifrado** | AES-256 con `BACKUP_PASSWORD`. Sin esa contraseña el archivo es ilegible, aunque alguien lo descargue. |
| **Integridad** | Huella `sha256`: si el archivo se modifica, la verificación falla. |
| **Verificación** | Cada backup se **restaura en un PostgreSQL vacío** y se comprueba que estén todas las filas de las 5 tablas. Si algo no coincide, la tarea falla y GitHub manda un aviso por mail. |
| **Dónde se guarda** | Como *artifact* de GitHub Actions, **fuera de Supabase**: si se pierde el proyecto de Supabase, el backup sigue estando. |
| **Retención** | 30 días (un backup por día). |
| **Costo** | Gratis. |

## 4. Mejoras según crezca la criticidad

| Nivel | Qué agregar | Para qué | Costo aprox. |
|---|---|---|---|
| Hoy (prototipo) | Backup diario cifrado y verificado en GitHub | RPO 24 h, copia fuera del proveedor | Gratis |
| Con clientes reales | **Supabase Pro**: backups diarios administrados por Supabase (7 días) y el proyecto no se pausa nunca | Restaurar con un clic desde el panel de Supabase | US$ 25/mes |
| Con clientes reales | **Copia inmutable** en un almacenamiento con *Object Lock* (ej. Backblaze B2 o Amazon S3): durante 30 días nadie la puede borrar ni modificar, ni siquiera con nuestras credenciales | Protege contra un borrado por error, una cuenta comprometida o ransomware | Gratis hasta 10 GB (B2) |
| Si se vuelve crítica | **PITR** (Point-in-Time Recovery) de Supabase | Volver a cualquier segundo de los últimos 7 días (RPO de segundos) | US$ 100/mes |
| Si se vuelve crítica | **Réplica de lectura** en otra región | Disponibilidad si cae la región de Supabase | según uso |

**Regla 3-2-1** (buena práctica): 3 copias de los datos, en 2 lugares distintos, 1 fuera del proveedor principal.
Hoy Returnly cumple: la base en Supabase, el backup en GitHub y el código en GitHub y en la compu de cada integrante.
Con Supabase Pro y la copia inmutable, además, una copia queda imposible de borrar.

## 5. Cómo restaurar (paso a paso)

1. **Elegir el backup:** en GitHub → **Actions** → *Backup de la base* → la ejecución del día que se quiere → **Artifacts** → descargar `returnly-base-AAAA-MM-DD_HHMM` (trae el `.dump.gpg` y el `.sha256`).
2. **Comprobar que no se modificó:** `sha256sum -c returnly-base-….sha256`.
3. **Descifrar** (pide `BACKUP_PASSWORD`): `gpg -d returnly-base-….dump.gpg > base.dump`.
4. **Elegir dónde restaurar:**
   - *La base se dañó pero el proyecto existe:* restaurar en el mismo proyecto de Supabase.
   - *Se perdió el proyecto:* crear un proyecto nuevo en Supabase.
5. **Restaurar** (con la cadena del *Session pooler* del proyecto, en Supabase → **Connect**):
   ```bash
   pg_restore --dbname "postgresql://postgres.<ref>:<contraseña>@<pooler>:5432/postgres" \
     --clean --if-exists --no-owner base.dump
   ```
6. **Si el proyecto es nuevo:** en Vercel (proyecto *returnly-backend*) actualizar `SUPABASE_URL` y `SUPABASE_SECRET_KEY`, y en GitHub el secreto `SUPABASE_DB_URL`. Volver a publicar (Redeploy).
7. **Comprobar:** entrar a Returnly con un admin y revisar Empresas, Usuarios y el Registro de accesos.

**Prueba de restauración:** se hace sola todos los días (paso 3 de la tarea). Además, una vez por semestre el equipo
hace el procedimiento completo a mano en un proyecto de prueba de Supabase y anota cuánto tardó (RTO real).

## 6. Configuración (una sola vez)

En GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Connect** → **Session pooler** → URI, con la contraseña de la base en lugar de `[YOUR-PASSWORD]`. (No la *Direct connection*: GitHub Actions no tiene IPv6.) |
| `BACKUP_PASSWORD` | Una frase larga al azar (20+ caracteres). **Guardarla en el gestor de contraseñas**: sin ella los backups no se pueden abrir. |
