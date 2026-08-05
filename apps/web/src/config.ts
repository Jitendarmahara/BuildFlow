// Dev endpoints (via kubectl port-forward). In prod these become the ingress hosts.
//   kubectl -n lovable-system port-forward svc/primary-backend 3000:3000
//   kubectl -n lovable-system port-forward svc/ws-server       4042:4042
//   kubectl -n projects       port-forward svc/preview-<id>    5173:5173   (active project)
export const API_URL = "http://localhost:3000";
export const WS_URL = "ws://localhost:4042";
// The live preview is per-project; in dev you port-forward the active project's preview
// service to this port. In prod this becomes https://<id>.preview.<domain>.
export const PREVIEW_URL = "http://localhost:5173";
