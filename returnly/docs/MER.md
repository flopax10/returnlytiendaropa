# MER de Returnly

Modelo Entidad-Relación de la base de datos de Returnly (PostgreSQL en Supabase), tal como está hoy.
La versión completa y explicada en simple está en **[MER-Returnly.pdf](MER-Returnly.pdf)** (9 páginas).
El PDF se genera desde [MER-fuente.html](MER-fuente.html).

```mermaid
erDiagram
    EMPRESA ||--o{ USUARIO : "tiene (solo clientes)"
    USUARIO |o--o{ ACCESO : "registra"
    USUARIO |o--o{ AUDITORIA : "hace cambios"
    EMPRESA ||--o{ SEGUIMIENTO : "marca"
    USUARIO |o--o{ SEGUIMIENTO : "actualiza"

    EMPRESA {
        text id PK "ej. google-merch"
        text nombre
        text fuente_tipo "ga4 o thelook"
        jsonb fuente_config "dónde están sus datos en BigQuery"
        text credencial_cifrada "KEY de Google encriptada (AES-256-GCM)"
        text credencial_email
        text web "http(s)://..."
        text nota
        boolean activa "baja = false, nunca se borra"
        timestamptz creada_en
    }
    USUARIO {
        uuid id PK
        text usuario UK "único y en minúsculas"
        text nombre
        text password_hash "scrypt"
        text rol "admin o cliente"
        text empresa_id FK "cliente: obligatoria / admin: vacía"
        boolean activo
        timestamptz creado_en
        timestamptz ultimo_acceso
        smallint intentos_fallidos
        boolean bloqueado_por_intentos
        timestamptz bloqueado_hasta
    }
    ACCESO {
        bigint id PK
        uuid usuario_id FK "vacío si el usuario no existe"
        text usuario_ingresado "lo que escribió"
        boolean exito
        text motivo
        text ip
        text user_agent
        timestamptz fecha
    }
    AUDITORIA {
        bigint id PK
        timestamptz fecha
        uuid actor_id FK "vacío = el sistema"
        text actor_usuario
        text accion
        text objetivo_tipo "usuario o empresa"
        text objetivo_id
        text objetivo_nombre
        text detalle
        text ip
    }
    SEGUIMIENTO {
        text empresa_id PK,FK
        text recomendacion_id PK "ej. perdemos"
        text estado "pendiente / en_curso / hecha"
        smallint voto "1 o -1"
        timestamptz actualizado_en
        uuid actualizado_por FK
    }
```

## Relaciones

| Relación | Tipo | Enlace | ¿Puede quedar vacío? |
|---|---|---|---|
| EMPRESA tiene USUARIOS | 1 a N | `usuario.empresa_id` | Solo para admins (la base obliga a que todo cliente tenga empresa) |
| USUARIO registra ACCESOS | 1 a N | `acceso.usuario_id` | Sí, si se escribió un usuario que no existe |
| USUARIO hace CAMBIOS | 1 a N | `auditoria.actor_id` | Sí, si lo hizo el sistema (bloqueo automático) |
| EMPRESA marca SEGUIMIENTO | 1 a N | `seguimiento.empresa_id` | No (parte de la clave) |
| USUARIO actualiza SEGUIMIENTO | 1 a N | `seguimiento.actualizado_por` | Sí |
| AUDITORIA es sobre un USUARIO o una EMPRESA | N a 1 | `objetivo_tipo` + `objetivo_id` | Sin enlace fijo (puede ser de dos tablas) |

Todas las tablas tienen RLS activado sin políticas: solo el backend (con la clave secreta) puede leerlas y escribirlas.
