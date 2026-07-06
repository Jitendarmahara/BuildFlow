export const PORT = 4000;
export const HOST = "127.0.0.1"; // localhost-only - unreachible outside the pod
export const PROJECT_ID = process.env.PROJECT_ID!;
export const WORKSPACE_DIR = "/workspace"

// this will return the s3Key path proper and unique for each 
export function s3Key(path:string):string{
    return `project/${PROJECT_ID}/${path}`
}