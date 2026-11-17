# Returnly

Portal que ayuda a las tiendas online a entender **por qué sus clientes no compran** y **qué hacer al respecto**.
Cada empresa entra con su usuario y ve dashboards y feedback calculados con **sus propios datos** de comportamiento
(embudo de compra, productos, canales, dispositivos, países). El equipo de Returnly administra las empresas, los
usuarios y la seguridad desde una pantalla de Admin.

🔗 **Web publicada:** https://returnly-portal-flo-e232.vercel.app

Proyecto obligatorio en grupo. Usa **GitHub** (código), **Supabase** (base de datos) y **Vercel** (publicación).

---

## Qué se puede hacer

**Como empresa (rol `cliente`)**
- **Panel:** indicadores, embudo de compra y gráficos de la empresa.
- **Feedback para tu negocio:** recomendaciones que responden preguntas del negocio ("¿dónde perdemos ventas?",
  "¿qué producto destacar?"…). Cada una tiene lo que encontramos, por qué puede pasar, qué hacer y un impacto
  estimado, con los datos que la respaldan.
- **Seguimiento:** marcar cada recomendación como pendiente, en curso o hecha (con el avance arriba) y votarla con
  👍 / 👎 para contarle a Returnly si sirvió.
- Cambiar la propia contraseña.

**Como Returnly (rol `admin`)**
- **Empresas:** alta, edición y baja; cuánto usa cada una el feedback (hechas, en curso, 👍 / 👎); carga de la KEY de Google de cada una (se guarda encriptada) y prueba de conexión.
- **Usuarios:** alta, bloqueo y reseteo de contraseña. Bloqueo automático a los 5 intentos fallidos.
- **Registro de accesos:** cada intento de ingreso con resultado, motivo, IP y navegador, con filtro por
  administradores, por empresa o por usuario inexistente.
- **Auditoría:** quién creó, editó, bloqueó, desbloqueó o reseteó qué, y cuándo (incluye los bloqueos automáticos).
- Abrir el panel de cualquier empresa.

## Cómo está armado

```
Navegador ──> Portal (React + Vite, Vercel)
                 │  /api
                 ▼
              Backend (Node.js + Express, Vercel)
                 ├──> Supabase: empresas, usuarios, accesos, auditoría y seguimiento
                 └──> BigQuery: datos de comportamiento de cada empresa, con SU KEY de Google
```

- El navegador **nunca** habla directo con Supabase ni con BigQuery: todo pasa por el backend.
- Las tablas de Supabase tienen RLS activado y sin políticas: con la clave pública no se pueden leer.
- Contraseñas hasheadas (scrypt), KEY de Google encriptadas (AES-256-GCM), sesión en cookie httpOnly firmada que
  se cierra a los 30 minutos sin uso (con aviso 2 minutos antes).

## Estructura del repositorio

| Carpeta | Qué es |
|---|---|
| [`returnly/portal`](returnly/portal) | Web de Returnly (login, panel, feedback y Admin) |
| [`returnly/backend`](returnly/backend) | API de Returnly. Su [README](returnly/backend/README.md) detalla roles, seguridad y rutas |
| [`returnly/supabase`](returnly/supabase) | SQL de las tablas de Supabase, en orden |
| [`returnly/docs`](returnly/docs) | Documentación: [modelo entidad-relación (MER)](returnly/docs/MER-Returnly.pdf) en PDF y [en GitHub](returnly/docs/MER.md) |
| [`.github/workflows`](.github/workflows) | Tarea diaria que mantiene activo el proyecto de Supabase |

## Datos de las empresas de ejemplo

| Empresa | Usuario | Datos |
|---|---|---|
| Google Merchandise Store | `google` | Export de GA4 público de Google (nov-2020 a ene-2021), ofuscado y con algunos huecos |
| TheLook (tienda de ropa) | `thelook` | Tienda simulada que Google publica en BigQuery, últimos 90 días |

Las contraseñas no están en el repositorio (es público): se entregan aparte.

## Cómo levantarlo en la compu

Requisitos: Node.js 22 o más.

```bash
# 1. Backend
cd returnly/backend
cp .env.example .env      # completar SESSION_SECRET, SUPABASE_SECRET_KEY y CREDENCIALES_KEY
npm install
npm start                 # http://localhost:3002

# 2. Portal (otra terminal)
cd returnly/portal
npm install
npm run dev               # http://localhost:5174
```

## Publicación

- Cada cambio que se sube a la rama `main` se publica solo en Vercel (portal y backend).
- Supabase pausa los proyectos gratuitos que pasan unos días sin uso. Para evitarlo, la tarea
  [`mantener-supabase.yml`](.github/workflows/mantener-supabase.yml) consulta la base una vez por día. Se puede
  correr a mano desde la pestaña **Actions** → *Mantener Supabase activo* → **Run workflow**.
