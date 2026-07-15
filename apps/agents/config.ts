export const PROJECT_ID = process.env.PROJECT_ID! ;
export const SIDECAR_URL = process.env.SIDECAR_URL ??  "http://localhost:4000";
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;
export const MODEL = process.env.MODEL ?? "deepseek-chat";
export const MAX_SUBAGENTS = 4;
export const MAX_TURNS  = 40 ; 

if (!PROJECT_ID) throw new Error("PROJECT_ID is required");
if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required");