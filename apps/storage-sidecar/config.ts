export const PORT = 4000;
export const HOST = "127.0.0.1"; // localhost-only - unreachible outside the pod
export const PROJECT_ID = process.env.PROJECT_ID!;
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "/workspace"

// this will return the s3Key path proper and unique for each
export function s3Key(path:string):string{
    return `project/${PROJECT_ID}/${path}`
}

// internal sidecar metadata objects in S3 (never surfaced as user files)
export const BUNDLE_KEY = `project/${PROJECT_ID}/.lovable/repo.bundle`;
export const FLUSHED_KEY = `project/${PROJECT_ID}/.lovable/flushed`;

// how often reconcile flushes the workspace to S3
export const RECONCILE_MS = 10 * 60 * 1000;