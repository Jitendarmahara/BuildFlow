// Bun.serve app shell for the web frontend. ONE image, two modes (12-factor):
//
//   dev  (no WEB_API_URL): Bun's dev server bundles index.html with HMR; config.ts falls back to
//                          localhost; a kubectl port-forward on :15173 tunnels the active preview.
//   prod (WEB_API_URL set): we build the SPA to ./dist once at boot and serve it statically,
//                          injecting `window.__APP_CONFIG__` (API/WS/preview hosts, from env)
//                          inline into <head> so the bundle reads the right URLs with no rebuild.
//
// Why inline-inject instead of `<script src="/config.js">`: a bundled HTML cannot reference a
// runtime-only route — Bun's production build tries to resolve /config.js as a file and fails,
// which serves an empty page. Injecting into the already-built HTML avoids that entirely.
import { join } from "node:path";
import index from "./index.html";

const PROD = !!process.env.WEB_API_URL;
const PORT = Number(process.env.PORT ?? 3001);

const APP_CONFIG = {
  API_URL: process.env.WEB_API_URL ?? "http://localhost:3000",
  WS_URL: process.env.WEB_WS_URL ?? "ws://localhost:4042",
  // literal "{id}" is substituted per project by the frontend (see src/config.ts)
  PREVIEW_TEMPLATE: process.env.WEB_PREVIEW_TEMPLATE ?? "http://localhost:15173",
};
const configScript = `<script>window.__APP_CONFIG__ = ${JSON.stringify(APP_CONFIG)};</script>`;

// ---------- dev-only kubectl port-forward helper ----------
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

// DEV ONLY. Ensure a port-forward to project <id>'s preview service on :15173. Retries while the
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

if (PROD) {
  // ---------- PROD: build the SPA once, serve it statically with config injected inline ----------
  const DIST = join(import.meta.dir, "dist");
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "index.html")],
    outdir: DIST,
    minify: true,
    publicPath: "/", // assets referenced as /name-hash.js so we can serve them by path below
    sourcemap: "none",
  });
  if (!built.success) {
    console.error("web build failed:\n" + built.logs.map(String).join("\n"));
    process.exit(1);
  }

  // inject the runtime config into the built HTML (before </head>, so it runs before the module bundle)
  const html = (await Bun.file(join(DIST, "index.html")).text()).replace("</head>", `${configScript}</head>`);
  const htmlResponse = () =>
    new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  const server = Bun.serve({
    port: PORT,
    development: false,
    async fetch(req) {
      const p = new URL(req.url).pathname;
      // preview (re)connect is a no-op in prod — the iframe points straight at the Caddy subdomain
      if (p.startsWith("/api/preview/") && req.method === "POST") return Response.json({ ok: true });
      // a built static asset (js/css/map/etc.) — anything that isn't the app shell path
      if (p !== "/" && !p.startsWith("/auth") && !p.startsWith("/dashboard") && !p.startsWith("/project/")) {
        const f = Bun.file(join(DIST, p));
        if (await f.exists()) return new Response(f);
      }
      // SPA fallback: every app route returns the shell
      return htmlResponse();
    },
  });
  console.log(`web on http://localhost:${server.port} (prod)`);
} else {
  // ---------- DEV: Bun dev server with HMR; config.ts uses localhost fallbacks ----------
  const server = Bun.serve({
    port: PORT,
    development: { hmr: true },
    routes: {
      "/api/preview/:id": {
        POST: async (req: any) => Response.json({ ok: await ensurePreview(req.params.id) }),
      },
      "/": index,
      "/auth": index,
      "/dashboard": index,
      "/project/:id": index,
      "/*": index, // SPA fallback
    },
  });
  console.log(`web on http://localhost:${server.port} (dev)`);
}
