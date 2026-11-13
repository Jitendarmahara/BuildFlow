// Runtime config. The server (server.ts) injects `window.__APP_CONFIG__` into index.html
// from its container env, so ONE built image works in every environment — dev falls back to
// localhost, prod gets the public domain URLs without a rebuild (12-factor).
//
//   dev (bun dev):  nothing injected → the localhost fallbacks below
//   prod (GKE):     server.ts injects { API_URL, WS_URL, PREVIEW_TEMPLATE } from env
type AppConfig = {
  API_URL: string;
  WS_URL: string;
  // a template with a literal `{id}` placeholder, e.g. "https://{id}.preview.example.com"
  PREVIEW_TEMPLATE: string;
};

const injected: Partial<AppConfig> = (globalThis as any).__APP_CONFIG__ ?? {};

export const API_URL = injected.API_URL ?? "http://localhost:3000";
export const WS_URL = injected.WS_URL ?? "ws://localhost:4042";

// In dev the preview is a single kubectl port-forward on :15173 (ignores the id). In prod each
// project has its own Caddy subdomain, so we substitute the id into the template.
const PREVIEW_TEMPLATE = injected.PREVIEW_TEMPLATE ?? "http://localhost:15173";
export function previewUrl(projectId: string): string {
  return PREVIEW_TEMPLATE.replace("{id}", projectId);
}

// True when the web server manages a kubectl port-forward for us (dev only). In prod the iframe
// points straight at the project's Caddy subdomain, so there is no tunnel to (re)connect.
export const PREVIEW_IS_LOCAL = !PREVIEW_TEMPLATE.includes("{id}");
