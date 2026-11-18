# Ambientes de Returnly: DEV, QA y PROD

Un **ambiente** es una copia completa de Returnly (pantallas + backend + base de datos) que se usa para un fin distinto.
Separarlos evita que un cambio a medio hacer o una prueba rompan lo que usan los clientes, o mezclen datos de prueba
con datos reales.

| | **DEV** (desarrollo) | **QA** (pruebas) | **PROD** (producción) |
|---|---|---|---|
| **Para qué** | Programar y probar mientras se hace un cambio | Probar el cambio terminado, como lo vería un cliente, antes de publicarlo | Lo que usan los clientes de verdad |
| **Quién lo usa** | Cada integrante, en su compu | El equipo (y el docente, para revisar) | Las empresas clientes y el equipo de Returnly |
| **Código** | Cualquier rama, en la compu | Rama **`qa`** de GitHub | Rama **`main`** de GitHub |
| **Pantallas** | `localhost:5174` (`npm run dev`) | https://returnly-portal-qa.vercel.app | https://returnly-portal.vercel.app |
| **Backend** | `localhost:3002` (`npm start`) | https://returnly-backend-qa.vercel.app | https://returnly-backend.vercel.app |
| **Base de datos** | Supabase **returnly-qa** (nunca la de producción) | Supabase **returnly-qa** | Supabase **Returnly** (producción) |
| **Datos** | De prueba | De prueba (usuario `admin.qa`, empresas de prueba) | Reales |
| **Secretos** | `.env` local (no se sube) | Variables del proyecto *returnly-backend-qa* en Vercel | Variables del proyecto *returnly-backend* en Vercel |
| **Se publica** | No | Solo, al subir cambios a `qa` | Solo, al subir cambios a `main` |

Cada ambiente tiene **sus propios secretos** (`SESSION_SECRET`, `CREDENCIALES_KEY`, clave de Supabase): una sesión o una
KEY de Google de QA no sirven en producción, y al revés.

## El camino de un cambio

```
  DEV                         QA                                PROD
  (tu compu)                  (rama qa)                         (rama main)
  ─────────────────────►  push a qa  ─────────────────────►  pull request qa → main
  programar y probar          Vercel publica QA solo            Vercel publica PROD solo
  contra la base de QA        el equipo prueba en               los clientes ven el cambio
                              returnly-portal-qa
```

1. **DEV:** se programa en una rama, probando en la compu contra la base de **QA**.
2. **QA:** se sube a la rama `qa` (`git push origin HEAD:qa` o un pull request a `qa`). Vercel publica solo el ambiente
   de QA. El equipo prueba en https://returnly-portal-qa.vercel.app con datos de prueba.
3. **PROD:** si está todo bien, se abre un **pull request de `qa` a `main`** en GitHub, otro integrante lo revisa y lo
   aprueba, y al unirlo Vercel publica producción.

Si algo sale mal en producción, se vuelve a la versión anterior desde Vercel (**Deployments → Promote** sobre la
publicación anterior) o revirtiendo el cambio en `main`.

## Cómo está implementado

- **Dos proyectos de Supabase:** *Returnly* (producción) y *returnly-qa*, con **exactamente la misma estructura**
  (los scripts de `returnly/supabase/`). El plan gratuito permite dos proyectos activos. La tarea diaria
  [`mantener-supabase.yml`](../../.github/workflows/mantener-supabase.yml) mantiene despiertos a los dos.
- **Cuatro proyectos de Vercel** conectados al mismo repo:

  | Proyecto de Vercel | Carpeta (Root Directory) | Rama de producción | Variables |
  |---|---|---|---|
  | returnly-portal | `returnly/portal` | `main` | — |
  | returnly-backend | `returnly/backend` | `main` | las de producción |
  | returnly-portal-qa | `returnly/portal` | `qa` | — |
  | returnly-backend-qa | `returnly/backend` | `qa` | las de QA |

- **El mismo código para los tres ambientes:** lo único que cambia son las variables (a qué base se conecta el backend)
  y la dirección. El portal de QA manda sus pedidos al backend de QA por una regla de [`vercel.json`](../portal/vercel.json)
  que mira desde qué dirección se abrió la página.
- **Backup:** solo de producción ([`BACKUP.md`](BACKUP.md)). QA y DEV tienen datos de prueba que se pueden recrear.

## Si Returnly creciera

- **Pull requests obligatorios:** proteger la rama `main` en GitHub (*Settings → Branches*) para que nadie suba
  directo a producción sin revisión.
- **Pruebas automáticas** que corran en cada pull request (GitHub Actions) y bloqueen el paso a `main` si fallan.
- **Datos de QA parecidos a los reales:** copiar producción a QA *anonimizada* (sin contraseñas ni KEY reales).
- **Supabase Branching** (plan pago): una base temporal por cada pull request, en lugar de una sola base de QA.
