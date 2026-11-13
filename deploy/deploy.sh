#!/usr/bin/env bash
# Deploy the whole platform to the CURRENT kubectl context (point it at your GKE cluster first:
#   gcloud container clusters get-credentials <cluster> --region <region> --project <project>
# ). Assumes images are already built+pushed (./deploy/build-push.sh).
# Run from the repo root:  ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
source deploy/config.env

# --- derived values (nothing else references the raw registry/DB strings) ---
export IMAGE_REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
export IMAGE_TAG DOMAIN LB_IP
DATABASE_URL="postgresql://lovable:${DB_PASSWORD}@postgres.lovable-system.svc.cluster.local:5432/lovable?sslmode=disable"

echo ">> context: $(kubectl config current-context)"
read -r -p ">> deploy to THIS context? [y/N] " ok; [ "$ok" = "y" ] || { echo "aborted"; exit 1; }

# render only our placeholders (leave Caddy's {http...} / regexp braces untouched)
render() { envsubst '${IMAGE_REGISTRY} ${IMAGE_TAG} ${DOMAIN} ${LB_IP}' < "$1"; }
apply()  { render "$1" | kubectl apply -f - ; }
secret() { kubectl create secret generic "$@" --dry-run=client -o yaml | kubectl apply -f - ; }

# 1) namespaces
for ns in lovable-system projects; do
  kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
done

# 2) secrets (idempotent — apply over any existing)
secret postgres-secret -n lovable-system \
  --from-literal=POSTGRES_USER=lovable \
  --from-literal=POSTGRES_PASSWORD="${DB_PASSWORD}" \
  --from-literal=POSTGRES_DB=lovable

secret backend-secrets -n lovable-system \
  --from-literal=DATABASE_URL="${DATABASE_URL}" \
  --from-literal=AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
  --from-literal=AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
  --from-literal=AWS_REGION="${AWS_REGION}" \
  --from-literal=AWS_BUCKET="${AWS_BUCKET}" \
  --from-literal=JWT_SECRET="${JWT_SECRET}"

secret project-secrets -n projects \
  --from-literal=DATABASE_URL="${DATABASE_URL}" \
  --from-literal=AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
  --from-literal=AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
  --from-literal=AWS_REGION="${AWS_REGION}" \
  --from-literal=AWS_BUCKET="${AWS_BUCKET}"

secret agent-secrets -n projects \
  --from-literal=DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY}"

# 3) database: bring up Postgres, then push the schema
kubectl apply -f deploy/postgres.yaml
kubectl -n lovable-system rollout status statefulset/postgres --timeout=180s
kubectl -n lovable-system delete job db-push --ignore-not-found
apply deploy/db-push-job.yaml
kubectl -n lovable-system wait --for=condition=complete job/db-push --timeout=180s

# 4) control plane
apply deploy/orchestrator.yaml
apply deploy/ws-server.yaml
apply deploy/primary-backend.yaml
apply deploy/web.yaml
apply deploy/caddy.yaml
apply deploy/reaper-cronjob.yaml

for d in orchestrator ws-server primary-backend web caddy; do
  kubectl -n lovable-system rollout status deploy/$d --timeout=180s
done

echo
echo ">> deployed. Caddy LoadBalancer IP (may take a minute to appear):"
kubectl -n lovable-system get svc caddy -o jsonpath='{.status.loadBalancer.ingress[0].ip}{"\n"}' || true
echo ">> point these DNS A records at that IP:"
echo "     app.${DOMAIN}   api.${DOMAIN}   ws.${DOMAIN}   *.preview.${DOMAIN}"
echo ">> then open:  https://app.${DOMAIN}"
