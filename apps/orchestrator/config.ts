export const PROJECTS_NAMESPACE = process.env.PROJECTS_NAMESPACE ?? "projects";
export const IMAGE_REGISTRY = process.env.IMAGE_REGISTRY!;
// Immutable per-build tag (e.g. a git SHA). On real nodes a mutable ":latest" + IfNotPresent
// silently serves whatever was cached first; a real tag makes IfNotPresent correct and cheap.
export const IMAGE_TAG = process.env.IMAGE_TAG ?? "latest";
export const VITE_PORT = 5173;
export const SIDECAR_PORT = 4000;
export const FIELD_MANAGER = "lovable-orchestrator";
export const FLUSH_PORT = 4001;