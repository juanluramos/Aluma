#!/bin/sh
# Prepara aluma_test con prisma/migrations y los catálogos de scripts/aluma-test-catalogos.sql.
# No lee ni copia usuarios, cuentas, inscripciones, movimientos ni auditoría.
# No crea, modifica ni borra la base aluma.
# Autorización: ALUMA_AUTORIZAR_ALUMA_TEST=1
# El nombre anterior ALUMA_AUTORIZAR_ALUMAT_TEST sigue siendo válido.
# Una segunda ejecución no borra datos: solo aplica migraciones pendientes e inserta catálogos ausentes.
# ALUMA_AUTORIZAR_REINICIO_ALUMA_TEST no está permitido: este script no reinicializa.
set -eu
cd "$(dirname "$0")/.."

cnf=$(mktemp)
url=$(mktemp)
trap 'rm -f "$cnf" "$url"' EXIT
chmod 600 "$cnf" "$url"

node --import tsx scripts/comprobar-preparacion-aluma-test.ts escribir "$cnf" "$url"

export DATABASE_URL="$(cat "$url")"
export DATABASE_NAME="aluma_test"
node --import tsx scripts/comprobar-preparacion-aluma-test.ts url

existe=$(mysql --defaults-extra-file="$cnf" --batch --skip-column-names --execute "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'aluma_test'")
if [ "$existe" = "aluma_test" ]; then
  echo "aluma_test ya existe. No se borra ni se recrea."
elif [ -n "$existe" ]; then
  echo "La consulta de destino no devolvió aluma_test." >&2
  exit 1
else
  mysql --defaults-extra-file="$cnf" --execute "CREATE DATABASE IF NOT EXISTS \`aluma_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
fi

sesion=$(mysql --defaults-extra-file="$cnf" --database=aluma_test --one-database --batch --skip-column-names --execute "SELECT DATABASE()")
if [ "$sesion" != "aluma_test" ]; then
  echo "La sesión de MariaDB no está en aluma_test." >&2
  exit 1
fi

npx prisma migrate deploy
mysql --defaults-extra-file="$cnf" --database=aluma_test --one-database < scripts/aluma-test-catalogos.sql
echo "aluma_test preparada. Los datos ya presentes se conservan."
