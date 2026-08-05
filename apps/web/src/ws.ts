import { WS_URL } from "./config";

// Events the agent streams down (via ws-server /subscribe). Mirrors the agent's emit().
// `agent` is present on sub-agent events (the orchestrator tags them with the subtask id);
// absent means the main agent.
export type AgentEvent =
  | { type: "token"; text: string; agent?: string }
  | { type: "tool_call"; id?: string; name: string; args?: any; agent?: string }
  | { type: "tool_result"; id?: string; name: string; result?: any; agent?: string }
  | { type: "verify"; ok: boolean; attempt: number }
  | { type: "question"; id: string; question: string; options?: string[] }
  | { type: "done"; text?: string }
  | { type: "error"; message: string }
  | { type: "files"; files: string[] }
  | { type: "file_content"; path: string; content: string }
  | { type: string; [k: string]: any };

// One live connection to a project's room. Browser → /subscribe.
// Auto-reconnects: a `kubectl port-forward` blip (or any network hiccup) closes the socket,
// and without this the UI would freeze mid-build. On every RE-connect we emit a synthetic
// `__reconnected` event so the page can re-fetch history and catch up on anything it missed.
export function connectProject(projectId: string, onEvent: (e: AgentEvent) => void) {
  let ws: WebSocket;
  let closedByUs = false;
  let attempts = 0;

  const send = (obj: unknown) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

  function connect() {
    ws = new WebSocket(`${WS_URL}/subscribe?projectId=${encodeURIComponent(projectId)}`);
    ws.onopen = () => {
      if (attempts > 0) onEvent({ type: "__reconnected" } as AgentEvent); // came back after a drop → re-sync
      attempts = 0;
    };
    ws.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data)); } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => {
      if (closedByUs) return;
      attempts++;
      setTimeout(connect, Math.min(1000 * attempts, 5000)); // backoff, capped at 5s
    };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  }
  connect();

  return {
    sendPrompt(content: string) { send({ type: "user_message", content }); },
    answer(id: string, content: string) { send({ type: "answer", id, content }); },
    listFiles() { send({ type: "list_files" }); },
    readFile(path: string) { send({ type: "read_file", path }); },
    close() { closedByUs = true; ws?.close(); },
    get raw() { return ws; },
  };
}
