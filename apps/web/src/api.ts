import { API_URL } from "./config";

const TOKEN_KEY = "lovable_token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
  get isLoggedIn() {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};

async function req(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
  return body;
}

export type Project = {
  id: string;
  title: string;
  status: "provisioning" | "idle" | "running" | "sleeping" | "archived" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  kind: "user" | "assistant" | "tool_call" | "tool_result";
  content: string | null;
  toolName: string | null;
  args?: any;
  path?: string | null;
  createdAt: string;
};

export const api = {
  async signup(email: string, password: string) {
    const { token } = await req("/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    auth.set(token);
  },
  async signin(email: string, password: string) {
    const { token } = await req("/signin", { method: "POST", body: JSON.stringify({ email, password }) });
    auth.set(token);
  },
  async listProjects(): Promise<Project[]> {
    const { projects } = await req("/projects");
    return projects;
  },
  async createProject(prompt: string): Promise<string> {
    const { projectId } = await req("/projects", { method: "POST", body: JSON.stringify({ prompt }) });
    return projectId;
  },
  async openProject(id: string): Promise<void> {
    await req(`/projects/${id}/open`, { method: "POST" });
  },
  async getMessages(id: string): Promise<Message[]> {
    const { message } = await req(`/projects/${id}/messages`);
    return message ?? [];
  },
};
