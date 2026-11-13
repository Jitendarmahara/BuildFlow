#!/usr/bin/env bash
# Build all 8 images and push them to Google Artifact Registry.
# Run from the repo root:  ./deploy/build-push.sh
set -euo pipefail

cd "$(dirname "$0")/.."
source deploy/config.env

IMAGE_REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
echo ">> registry: ${IMAGE_REGISTRY}"
echo ">> tag:      ${IMAGE_TAG}"

# one-time per machine (safe to re-run): let docker push to this AR host
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# app -> image-name (the shared Dockerfile runs apps/<app>/<entry>)
build() { # <app> <image-name> [entry]
  local app="$1" name="$2" entry="${3:-index.ts}"
  local ref="${IMAGE_REGISTRY}/${name}:${IMAGE_TAG}"
  echo ">> building ${ref}  (apps/${app}/${entry})"
  docker build --build-arg APP="${app}" --build-arg ENTRY="${entry}" -t "${ref}" .
  docker push "${ref}"
}

build agents          lovable-agent
build storage-sidecar lovable-sidecar
build orchestrator    lovable-orchestrator
build ws-server       lovable-ws-server
build primary-backend lovable-primary-backend
build reaper          lovable-reaper
build web             lovable-web          server.ts

# preview-build has its own Dockerfile (ships no app code; installs on first pod boot)
PREVIEW_REF="${IMAGE_REGISTRY}/lovable-preview-build:${IMAGE_TAG}"
echo ">> building ${PREVIEW_REF}"
docker build -f dockerfile.preview -t "${PREVIEW_REF}" .
docker push "${PREVIEW_REF}"

echo ">> done. all images pushed at tag ${IMAGE_TAG}."
