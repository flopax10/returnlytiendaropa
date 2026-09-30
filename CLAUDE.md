# Returnly · contexto para Claude Code

Este archivo le da a Claude Code todo el contexto del proyecto al abrir una sesión nueva.

## Cómo trabajar conmigo

- Escribime en **español rioplatense**.
- Explicaciones **muy simples y paso a paso**.
- Preferí **hacer las cosas vos** (editar, correr comandos, commitear) antes que pasarme pasos manuales.
- No subas secretos al repo (contraseñas, service role key de Supabase, etc.).

## Qué es el proyecto

Obligatorio de la facultad. **Returnly** es una plataforma B2B para gestionar **devoluciones** de tiendas de ropa online.

- **Entra en el alcance:** la solicitud de devolución (el cliente identifica su compra, elige el producto y da un motivo) y el **análisis de los motivos** con reportes para la empresa (ej.: "esta remera se devuelve mucho porque viene chica").
- **No entra:** stock, facturación, reintegros ni logística. Eso es del retailer.

Flujo del cliente: entra número de pedido + email → ve los productos que compró → elige cuál devolver → elige un motivo (lista) y opcionalmente escribe un comentario → recibe un número de devolución.

El plan completo está en `/mnt/project-files/returnly/plan-prototipo.md` (si no tenés esa carpeta, pedímelo). Resumen abajo.

## Arquitectura

```
 [Tienda TRAMA]  <── API REST (x-api-key) ──>  [Returnly]  <── cliente (portal de devolución)
  web + API + Postgres propio                   backend + Supabase     └─ empresa (panel de reportes)
```

Regla clave: **son dos sistemas separados, cada uno con su base de datos**. Returnly solo conoce las compras a través de la API de la tienda; nunca lee la base de la tienda directamente. Así se simula una integración real (Shopify, VTEX, etc.).

## Estructura del repo

```
tienda/                  Tienda demo "TRAMA" (el retailer simulado) — YA HECHA
  backend/               Node + Express (puerto 3001), pg sin ORM
    db/schema.sql        producto, variante, cliente, pedido, item_pedido
    db/seed.js           20 clientes, 202 pedidos de los últimos 4 meses
    src/routes/integracion.js   API para Returnly
    src/routes/tienda.js        API interna de la web
  frontend/              React + Vite (puerto 5173)
    src/supabase.js      lectura mínima de Supabase por REST
    src/pages/Devoluciones.jsx  manda al portal de Returnly y lista los motivos
  docker-compose.yml     Postgres 16 en el puerto 5433
  README.md              detalle de la tienda y su API
returnly/
  supabase/              SQL de las tablas de Returnly (se aplican en Supabase)
    001_motivo.sql
    002_motivo_mas_registros.sql
```

La carpeta del portal/backend de Returnly **todavía no existe**. Sugerencia: `returnly/portal/` (React + Vite, puerto **5174**).

## Stack

- Tienda: React + Vite, Node + Express, PostgreSQL 16 (Docker).
- Returnly: base de datos en **Supabase** (proyecto `zxwudwagkowbxaonzaoh`, URL `https://zxwudwagkowbxaonzaoh.supabase.co`). El front usa la clave publicable (pública por diseño; los permisos los da RLS). La service role key **nunca** va al repo.
- Gráficos (para reportes): Chart.js o Recharts.
- El stack es el default del plan; la cátedra no lo confirmó.

## Cómo levantar la tienda en local

Requisitos: Node 20+ y Docker.

```bash
cd tienda
docker compose up -d                 # Postgres en localhost:5433

cd backend
cp .env.example .env
npm install
npm run db:reset                     # crea tablas + datos de ejemplo
npm run dev                          # http://localhost:3001

# otra terminal
cd tienda/frontend
cp .env.example .env
npm install
npm run dev                          # http://localhost:5173
```

Usuarios de prueba (contraseña `demo1234` para todos):

| Email | Pedido |
|---|---|
| lucia.fernandez@example.com | TR-1200 (Remera Básica Negra S + Jean Recto 40) |
| martin.rodriguez@example.com | TR-1201 (Championes Running 42 + Lentes de Sol) |

## API de la tienda para Returnly

Header obligatorio `x-api-key` = `RETURNLY_API_KEY` del backend (por defecto `clave-demo-returnly`, solo para la demo).

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/orders?number=TR-1200&email=...` | Pedido + ítems (id, sku, producto, categoria, talle, color, cantidad, precioUnitario, devuelto) |
| POST | `/api/orders/:number/returns` body `{email, itemIds, referencia}` | Marca ítems como devueltos en la tienda |
| GET | `/api/sales-summary?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Unidades vendidas por variante (para tasa de devolución) |

Errores: `401` key inválida, `404` pedido/email no coinciden, `400` ítems ajenos al pedido, `409` ya devueltos.

El botón "Solicitar devolución" de la tienda abre `VITE_RETURNLY_URL` (por defecto `http://localhost:5174`) con `?pedido=TR-1200&email=...`. **El portal de Returnly tiene que leer esos parámetros** y precargar el formulario.

## Estado actual (30/09/2026)

- ✅ Tienda TRAMA completa: catálogo (8 productos), carrito, checkout sin pago, registro/login, perfil con pedidos, página de Devoluciones, API para Returnly, datos semilla.
- ✅ Supabase: tabla `motivo` creada con **11 motivos** (Talle, Calidad, No coincide con la foto/descripción, Producto dañado o defectuoso, Llegó otro producto, Cambié de opinión, No me queda bien el calce, Llegó tarde, Compré por error / pedido duplicado, Encontré un precio mejor, Otro). Columnas: `id, categoria, subopciones text[], requiere_comentario, orden`. RLS activado, solo lectura pública. "Otro" va último (`orden = 99`) y obliga comentario.
- ✅ La página Devoluciones de la tienda ya lee `motivo` desde Supabase.
- ⬜ Resto de las tablas de Returnly, el portal del cliente y el panel de reportes.

## Próximos pasos (en orden)

1. **Tablas en Supabase** (guardar cada SQL como `returnly/supabase/003_...sql`):
   - `devolucion` (id, numero tipo `RET-0001`, numero_pedido_externo, email_cliente, fecha, estado). Opcional `empresa` si se quiere multi-tienda.
   - `item_devuelto` (id, devolucion_id, item_externo_id, sku, nombre_producto, categoria_producto, talle, color, motivo_id → motivo, sub_motivo, comentario). Se guarda **copia** de los datos del producto para que los reportes no dependan de la tienda.
   - RLS: el cliente puede insertar su devolución; la lectura para reportes solo con usuario de empresa.
2. **Backend de Returnly** (Node + Express): llama a la API de la tienda con la API key (la key no puede ir en el front) y guarda en Supabase. Reglas: solo ítems de ese pedido, no devolver dos veces el mismo ítem, plazo de 30 días.
3. **Portal del cliente** (`returnly/portal`, puerto 5174): pedido + email → ítems → motivo/submotivo/comentario → confirmación con número de devolución.
4. **Panel de la empresa** con reportes: motivos más frecuentes, tasa de devolución por producto, alertas de talle (>40% "talle chico/grande"), por talle y color, evolución en el tiempo, comentarios filtrables, exportar CSV.
5. **Datos semilla de devoluciones** con patrones a propósito (ej. muchas devoluciones de la Remera Básica Negra por talle chico) para que los reportes muestren algo.
6. Documentación final: diagrama de arquitectura y ER.

## Notas del entorno

- Si trabajás desde la nube, `localhost` no es accesible para mí desde el navegador; para probar la app hay que correrla en mi compu.
- Las tablas de Supabase se crean con el conector de Supabase (o pegando el SQL en el SQL Editor del dashboard).
