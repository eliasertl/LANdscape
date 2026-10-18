#!/bin/sh
# Rebuilds the LANdscape image from GitHub and restarts the running container.
#
# Usage:
#   ./Scripts/update.sh                      # build from main, restart container "landscape"
#   REF=dev ./Scripts/update.sh              # build another branch/tag
#   CONTAINER=my-landscape ./Scripts/update.sh
#   COMPOSE_DIR=/DATA/AppData/casaos/apps/landscape ./Scripts/update.sh   # restart via docker compose
set -eu

REPO="${REPO:-https://github.com/eliasertl/LANdscape.git}"
REF="${REF:-main}"
IMAGE="${IMAGE:-landscape:latest}"
CONTAINER="${CONTAINER:-landscape}"
COMPOSE_DIR="${COMPOSE_DIR:-}"

echo "==> Building ${IMAGE} from ${REPO}#${REF}"
docker build --pull -t "${IMAGE}" "${REPO}#${REF}"

if [ -n "${COMPOSE_DIR}" ] && [ -f "${COMPOSE_DIR}/docker-compose.yml" ]; then
  echo "==> Recreating via docker compose in ${COMPOSE_DIR}"
  (cd "${COMPOSE_DIR}" && docker compose up -d --force-recreate)
elif docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "==> Restarting container ${CONTAINER}"
  # A plain restart keeps the old image; recreate through CasaOS or compose for a full update.
  if docker inspect "${CONTAINER}" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' | grep -q .; then
    DIR="$(docker inspect "${CONTAINER}" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"
    echo "    found compose project in ${DIR}"
    (cd "${DIR}" && docker compose up -d --force-recreate) || docker restart "${CONTAINER}"
  else
    docker restart "${CONTAINER}"
  fi
else
  echo "==> Image built. No running container named ${CONTAINER}; start it from CasaOS or docker compose."
fi

echo "==> Pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true
echo "==> Done"
