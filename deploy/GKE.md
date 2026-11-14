# Deploying Lovable to GKE

This takes you from source code to a public, HTTPS deployment on Google Kubernetes Engine.
Everything is driven from **one file**, `deploy/config.env`, and **two scripts**,
`deploy/build-push.sh` (images → Artifact Registry) and `deploy/deploy.sh` (manifests → cluster).

## Architecture on GKE

```
                        Internet
                           │  (DNS: app. api. ws. *.preview → one LB IP)
                           ▼
                 ┌─────────────────────┐   LoadBalancer (public IP) + auto-TLS
                 │        Caddy         │   app.→web  api.→backend  ws.→ws-server
                 └──────────┬──────────┘   *.preview.<id>→ project pod's Vite
         ┌──────────┬───────┼─────────┬──────────────┐
         ▼          ▼       ▼         ▼              ▼
       web     primary-   ws-     orchestrator    postgres   ← namespace: lovable-system
                backend   server   (private)     (StatefulSet)
                   │                   │
                   └── POST /boot ─────┘  creates, per project ↓
                                   ┌───────────────────────────────┐
                                   │ project pod: agent + preview-  │  ← namespace: projects
                                   │ build + storage-sidecar (+PVC) │
                                   └───────────────────────────────┘
```

- **Images** live in **Google Artifact Registry**, pulled by immutable tag (`IMAGE_TAG`).
- **Database** is **in-cluster Postgres** (a StatefulSet with a PVC) at
  `postgres.lovable-system.svc.cluster.local:5432`, reachable by both namespaces.
- **Public access** is a single **Caddy LoadBalancer** that terminates TLS and routes by host.
  The orchestrator stays private (ClusterIP) — nothing external can reach the pod-deleting API.

---

## 0. Prerequisites (once)

Install `gcloud`, `kubectl`, `docker`, `bun`. You need:
- a GCP project (you have `console.cloud.google.com`),
- your **S3 bucket + AWS creds** and your **DeepSeek API key** (same ones you use locally).
- **No domain required** — we use `nip.io` (a free wildcard-DNS service that maps
  `<anything>.<ip>.nip.io` → `<ip>`), so a reserved static IP is all you need for real HTTPS.

```bash
REGION=asia-south1        # Artifact Registry + static IP region (Mumbai; pick your nearest)
ZONE=asia-south1-a        # cluster zone
PROJECT=YOUR_PROJECT_ID

# auth + target your project
gcloud auth login
gcloud config set project "$PROJECT"
gcloud services enable container.googleapis.com artifactregistry.googleapis.com

# Artifact Registry repo (name must match AR_REPO in config.env)
gcloud artifacts repositories create lovable \
  --repository-format=docker --location="$REGION" --description="lovable images"

# a cheap, always-on cluster: 1 Spot node, small machine, standard disk
gcloud container clusters create lovable \
  --zone "$ZONE" --num-nodes 1 --machine-type e2-standard-2 \
  --spot --disk-type pd-standard --disk-size 50
gcloud container clusters get-credentials lovable --zone "$ZONE"
kubectl get nodes                 # confirm 1 node, STATUS Ready

# reserve the static IP the LoadBalancer will pin to (this becomes your nip.io host)
gcloud compute addresses create lovable-ip --region "$REGION"
gcloud compute addresses describe lovable-ip --region "$REGION" --format='value(address)'
#   -> put this IP in config.env as LB_IP, and DOMAIN=<ip>.nip.io

# let the GKE node pull images from Artifact Registry (avoids ImagePullBackOff)
NODE_SA=$(gcloud iam service-accounts list --format='value(email)' --filter='Compute Engine default')
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${NODE_SA}" --role=roles/artifactregistry.reader --condition=None
```

## 1. Configure

```bash
cp deploy/config.env.example deploy/config.env
# edit deploy/config.env — PROJECT_ID, REGION, AR_REPO, IMAGE_TAG, DOMAIN,
# DB_PASSWORD, DEEPSEEK_API_KEY, AWS_*, JWT_SECRET
```
`deploy/config.env` is gitignored — it holds your secrets.

## 2. Build + push images

```bash
./deploy/build-push.sh      # builds 8 images, pushes them all at tag $IMAGE_TAG
```

## 3. Deploy

```bash
./deploy/deploy.sh          # namespaces → secrets → Postgres → schema → control plane
```
It prints the Caddy LoadBalancer IP at the end (give it a minute to be assigned).

## 4. DNS

**Using nip.io (default): nothing to do.** `nip.io` already resolves every
`*.<LB_IP>.nip.io` name to your IP, and because the LoadBalancer is pinned to the reserved
`LB_IP`, the hostnames in `config.env` already point at it. Skip straight to opening the app.

**Using your own domain instead:** create these A records, all pointing at `LB_IP`:

| Record            | Type | Value   |
|-------------------|------|---------|
| `app.DOMAIN`      | A    | <LB_IP> |
| `api.DOMAIN`      | A    | <LB_IP> |
| `ws.DOMAIN`       | A    | <LB_IP> |
| `*.preview.DOMAIN`| A    | <LB_IP> |

Caddy issues Let's Encrypt certs on first request. Open:

```
https://app.DOMAIN            # nip.io: https://app.<LB_IP>.nip.io
```
Sign up → type a prompt → watch it build live → the preview loads from
`https://<projectId>.preview.DOMAIN`.

---

## Rebuild after a code change

Bump `IMAGE_TAG` in `deploy/config.env` (treat tags as immutable — don't reuse one), then:

```bash
./deploy/build-push.sh
./deploy/deploy.sh          # re-applies with the new tag; rolls pods automatically
```
Because the tag changes, Kubernetes actually rolls the Deployments (the `:latest` trap — a
reused tag produces no diff and no rollout — is why we tag per build).

## Notes / troubleshooting

- **ImagePullBackOff?** The GKE node service account must be allowed to read Artifact Registry.
  If pods can't pull, grant it (one-time):
  ```bash
  NODE_SA=$(gcloud iam service-accounts list --format='value(email)' --filter='Compute Engine default')
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:${NODE_SA}" --role=roles/artifactregistry.reader
  ```
- **Caddy IP:** `kubectl -n lovable-system get svc caddy -w` until `EXTERNAL-IP` appears.
- **Certs:** issued on demand; `*.preview.*` certs are gated by `primary-backend`'s
  `/internal/allow-tls` so only real project subdomains get a cert. Let's Encrypt has a
  ~50 new-subdomain-certs/week limit — fine for normal use; a wildcard cert (DNS-01 challenge)
  is the upgrade path if you ever outgrow it.
- **DB data** survives pod restarts (PVC). To wipe it: delete the `postgres` StatefulSet's PVC.
- **Schema changes:** re-run `./deploy/deploy.sh` (it re-runs the idempotent `db-push` Job).
- **Orchestrator + Bun + @kubernetes/client-node** needs `NODE_EXTRA_CA_CERTS` (already set in
  `orchestrator.yaml`) or `bootPod` fails TLS to the API server.
- **Logs:** `kubectl -n lovable-system logs deploy/primary-backend` (or `orchestrator`,
  `ws-server`, `web`, `caddy`); project pods: `kubectl -n projects get pods`.
```
