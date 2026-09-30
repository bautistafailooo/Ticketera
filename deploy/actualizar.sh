#!/usr/bin/env bash
# Baja la última versión de ecko y la vuelve a publicar. Uso: bash /opt/ecko/deploy/actualizar.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Bajando cambios de $BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Reconstruyendo y reiniciando (la base y los flyers se conservan)"
docker compose up -d --build

echo "==> Limpiando imágenes viejas"
docker image prune -f >/dev/null

docker compose ps
echo "Listo. Si algo no anda: docker compose logs --tail 50 app"
