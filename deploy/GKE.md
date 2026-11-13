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
- a **GKE cluster** (create it in the console — a small standard/autopilot cluster is fine),
- a **domain** you control (to point DNS at the load balancer),
- your **S3 bucket + AWS creds** and your **DeepSeek API key** (same ones you use locally).

```bash
# auth + target your project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# create the Artifact Registry repo (name must match AR_REPO in config.env)
gcloud artifacts repositories create lovable \
  --repository-format=docker --location=us-central1 \
  --description="lovable images"

# point kubectl at your GKE cluster
gcloud container clusters get-credentials YOUR_CLUSTER \
  --region us-central1 --project YOUR_PROJECT_ID
kubectl config current-context    # confirm it's the GKE cluster
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

Create these records at your DNS provider, all pointing at the Caddy LB IP:

| Record            | Type | Value         |
|-------------------|------|---------------|
| `app.DOMAIN`      | A    | <Caddy LB IP> |
| `api.DOMAIN`      | A    | <Caddy LB IP> |
| `ws.DOMAIN`       | A    | <Caddy LB IP> |
| `*.preview.DOMAIN`| A    | <Caddy LB IP> |

Once DNS propagates, Caddy issues Let's Encrypt certs on first request. Open:

```
https://app.DOMAIN
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
