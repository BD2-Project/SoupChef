#!/usr/bin/env sh
# Copia los CSV de benchmarks del motor al frontend.
#
# Las gráficas de la comparación 2.2.4 se arman en tiempo de compilación con
# `import.meta.glob`, así que la app empaquetada no puede leer el repo del motor:
# los CSV tienen que viajar dentro del bundle. Ejecutar esto después de cada
# corrida de benchmarks en SoupDB.
set -eu

ENGINE="${1:-../SoupDB}"
SOURCE="$ENGINE/benchmarks/results"
TARGET="$(dirname "$0")/../src/lib/benchmarks/results"

if [ ! -d "$SOURCE" ]; then
  echo "No se encontró $SOURCE. Pasá la ruta del repo del motor como argumento." >&2
  exit 1
fi

mkdir -p "$TARGET"
cp "$SOURCE"/*.csv "$TARGET"/
ls -1 "$TARGET"
