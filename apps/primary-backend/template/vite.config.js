import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// This app runs inside the project pod and is served to the browser through
// Caddy at {projectId}.preview.<domain>.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 0.0.0.0 — reachable by the K8s Service inside the pod
    port: 5173,
    allowedHosts: true, // accept the Caddy preview subdomain (Vite blocks unknown hosts otherwise)
    // The agent/sidecar writes files from ANOTHER container onto the shared PVC. inotify
    // events don't cross that boundary reliably, so native watching misses every change and
    // HMR never fires. Poll the filesystem instead — the only way to get live updates here.
    watch: { usePolling: true, interval: 300 },
    // The preview is served over HTTPS at {id}.preview.<domain> through Caddy, so the HMR
    // client must dial back over wss on 443 (not ws on 5173) or hot-reload never connects.
    hmr: { clientPort: 443, protocol: "wss" },
  },
});
