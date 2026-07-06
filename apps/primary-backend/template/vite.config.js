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
    // Behind Caddy's TLS you may also need: hmr: { clientPort: 443, protocol: "wss" }
  },
});
