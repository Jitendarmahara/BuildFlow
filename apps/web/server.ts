// Bun.serve app shell for the web frontend.
//
// Serves the bundled SPA (index.html fallback for client routes) and hands the browser its
// runtime config via /config.js — read from this container's env, so the SAME image works in
// dev and in prod without a rebuild. In prod (WEB_API_URL set) each project's live preview is
// reached directly at its Caddy subdomain, so there is nothing to tunnel. In dev the preview is
// one kubectl port-forward on :15173 that this server (running on your host with your kubeconfig)
// manages for whichever project you're viewing.
import index from "./index.html";

// prod == we were handed the public URLs; dev == localhost fallbacks + the port-forward helper
const PROD = !!process.env.WEB_API_URL;
const APP_CONFIG = {
  API_URL: process.env.WEB_API_URL ?? "http://localhost:3000",
  WS_URL: process.env.WEB_WS_URL ?? "ws://localhost:4042",
  // literal "{id}" is substituted per project by the frontend (see src/config.ts)
  PREVIEW_TEMPLATE: process.env.WEB_PREVIEW_TEMPLATE ?? "http://localhost:15173",
};

let pf: Bun.Subprocess | null = null;
let pfId: string | null = null;

async function reachable(): Promise<boolean> {
  try {
    const r = await fetch("http://127.0.0.1:15173/", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// DEV ONLY. Ensure a port-forward to project <id>'s preview service on :5173. Retries while the
// pod wakes from sleep (the frontend calls /open first). Returns whether it became reachable.
async function ensurePreview(id: string): Promise<boolean> {
  if (pfId === id && (await reachable())) return true;
  if (pf) { pf.kill(); pf = null; }
  pfId = id;
  for (let i = 0; i < 24; i++) {
    if (!pf || pf.exitCode !== null) {
      pf = Bun.spawn(
        ["kubectl", "-n", "projects", "port-forward", `svc/preview-${id}`, "15173:5173"],
        { stdout: "ignore", stderr: "ignore" },
      );
    }
    await Bun.sleep(1500);
    if (pfId !== id) return false; // superseded by a newer request
    if (await reachable()) return true;
  }
  return false;
}

const configJs = `window.__APP_CONFIG__ = ${JSON.stringify(APP_CONFIG)};`;

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  // HMR only in dev; a prod container serves the bundle statically.
  development: PROD ? false : { hmr: true },
  routes: {
    // the browser loads this (classic script, before the deferred module bundle) to pick up
    // its environment — API/WS hosts and the per-project preview URL template
    "/config.js": () =>
      new Response(configJs, { headers: { "content-type": "application/javascript", "cache-control": "no-store" } }),

    // frontend calls this to (re)connect the active project's preview. In prod the iframe goes
    // straight to the Caddy subdomain, so this is a no-op; in dev it drives the port-forward.
    "/api/preview/:id": {
      POST: async (req) => {
        if (PROD) return Response.json({ ok: true });
        const ok = await ensurePreview((req as any).params.id);
        return Response.json({ ok });
      },
    },
    "/": index,
    "/auth": index,
    "/dashboard": index,
    "/project/:id": index,
    "/*": index, // SPA fallback
  },
});

console.log(`web on http://localhost:${server.port} (${PROD ? "prod" : "dev"})`);
