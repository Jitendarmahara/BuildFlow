// Bun.serve app shell for the web frontend. Serves the bundled SPA (with an index.html
// fallback for client routes) AND auto-manages the per-project preview port-forward, so
// the iframe's localhost:5173 always points at whatever project you're viewing — no manual
// kubectl. (Dev only: the server runs on the host with your kubeconfig.)
import index from "./index.html";

let pf: Bun.Subprocess | null = null;
let pfId: string | null = null;

async function reachable(): Promise<boolean> {
  try {
    const r = await fetch("http://127.0.0.1:5173/", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// Ensure a port-forward to project <id>'s preview service on :5173. Retries while the pod
// wakes from sleep (the frontend calls /open first). Returns whether it became reachable.
async function ensurePreview(id: string): Promise<boolean> {
  if (pfId === id && (await reachable())) return true;
  if (pf) { pf.kill(); pf = null; }
  pfId = id;
  for (let i = 0; i < 24; i++) {
    if (!pf || pf.exitCode !== null) {
      pf = Bun.spawn(
        ["kubectl", "-n", "projects", "port-forward", `svc/preview-${id}`, "5173:5173"],
        { stdout: "ignore", stderr: "ignore" },
      );
    }
    await Bun.sleep(1500);
    if (pfId !== id) return false; // superseded by a newer request
    if (await reachable()) return true;
  }
  return false;
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  development: { hmr: true },
  routes: {
    // frontend calls this to (re)connect the active project's preview
    "/api/preview/:id": {
      POST: async (req) => {
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

console.log(`web on http://localhost:${server.port}`);
