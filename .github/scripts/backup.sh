#!/usr/bin/env bash
# Backup de la base de Returnly (Supabase / PostgreSQL). Lo usa .github/workflows/backup-base.yml
#
#   backup.sh exportar   -> pg_dump del esquema public, cifrado con AES-256 (gpg) + huella sha256 + conteo de filas
#   backup.sh verificar  -> descifra, restaura en una base VACÍA y comprueba que estén todas las filas
#
# Variables:
#   ARCHIVO           nombre base de los archivos (sin extensión)
#   BACKUP_PASSWORD   contraseña de cifrado (secreto de GitHub; guardarla también en un gestor de contraseñas)
#   SUPABASE_DB_URL   conexión a Supabase por el "Session pooler" (solo para exportar)
#   PRUEBA_DB_URL     conexión a un PostgreSQL vacío de prueba, base "postgres" (solo para verificar)
set -euo pipefail

TABLAS="empresa usuario acceso auditoria seguimiento"

conteos() { # cantidad de filas por tabla, una línea "tabla cantidad" por tabla
  for t in $TABLAS; do
    printf '%s %s\n' "$t" "$(psql "$1" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.$t")"
  done
}

case "${1:-}" in
  exportar)
    : "${ARCHIVO:?falta ARCHIVO}" "${BACKUP_PASSWORD:?falta BACKUP_PASSWORD}" "${SUPABASE_DB_URL:?falta SUPABASE_DB_URL}"
    # Las filas solo se agregan (nada se borra), así que el backup tiene que quedar entre el conteo de antes y el de después
    conteos "$SUPABASE_DB_URL" > "$ARCHIVO.antes"
    pg_dump "$SUPABASE_DB_URL" --schema=public --format=custom --compress=9 --no-owner \
      | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
            -o "$ARCHIVO.dump.gpg" 3<<<"$BACKUP_PASSWORD"
    conteos "$SUPABASE_DB_URL" > "$ARCHIVO.despues"
    sha256sum "$ARCHIVO.dump.gpg" > "$ARCHIVO.sha256"
    echo "Backup cifrado: $ARCHIVO.dump.gpg ($(du -h "$ARCHIVO.dump.gpg" | cut -f1))"
    ;;

  verificar)
    : "${ARCHIVO:?falta ARCHIVO}" "${BACKUP_PASSWORD:?falta BACKUP_PASSWORD}" "${PRUEBA_DB_URL:?falta PRUEBA_DB_URL}"
    sha256sum -c "$ARCHIVO.sha256"
    TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
    gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$ARCHIVO.dump.gpg" 3<<<"$BACKUP_PASSWORD" > "$TMP/base.dump"
    # Los roles de Supabase a los que se les dan o quitan permisos
    psql "$PRUEBA_DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I', r); END IF;
  END LOOP;
END $$;
DROP DATABASE IF EXISTS restaurada;
CREATE DATABASE restaurada;
SQL
    RESTAURADA=$(printf '%s' "$PRUEBA_DB_URL" | sed -E 's#/postgres(\?|$)#/restaurada\1#')
    psql "$RESTAURADA" -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE"
    pg_restore --dbname "$RESTAURADA" --no-owner --exit-on-error "$TMP/base.dump"
    conteos "$RESTAURADA" > "$ARCHIVO.restaurada"
    echo "| Tabla | Filas antes | Filas restauradas | Filas después | |"
    echo "|---|---:|---:|---:|---|"
    ok=1
    while read -r t antes && read -r _ rest <&4 && read -r _ desp <&5; do
      if [ "$rest" -ge "$antes" ] && [ "$rest" -le "$desp" ]; then marca="✅"; else marca="❌"; ok=0; fi
      echo "| $t | $antes | $rest | $desp | $marca |"
    done < "$ARCHIVO.antes" 4< "$ARCHIVO.restaurada" 5< "$ARCHIVO.despues"
    for t in empresa usuario; do
      [ "$(grep "^$t " "$ARCHIVO.restaurada" | cut -d' ' -f2)" -ge 1 ] || { echo "La tabla $t quedó vacía"; ok=0; }
    done
    [ "$ok" = 1 ] || { echo "❌ La restauración de prueba NO coincide con la base"; exit 1; }
    echo ""
    echo "✅ Restauración de prueba correcta: el backup se puede recuperar completo."
    ;;

  *) echo "Uso: $0 exportar|verificar" >&2; exit 2 ;;
esac
