import { PROJECT_ID } from "./config";
import { WebSocket } from "ws";

const WS_URL = process.env.WS_SERVER_URL ?? "ws://localhost:4042";
const INGEST_URL = `${WS_URL}/ingest?projectId=${PROJECT_ID}`;

// This socket is the agent's only link to ws-server — both outgoing events (broadcast)
// and incoming prompts/answers (onIncoming) ride it. Without a reconnect, one drop
// (ws-server restart, network blip) kills the link forever: broadcast() would silently
// no-op on every future call, and the browser would never see another update.
let socket: WebSocket;
let incoming: ((raw: string) => void) | null = null;
let attempts = 0;

function connect() {
    socket = new WebSocket(INGEST_URL);
    socket.onopen = () => {
        console.log("stream connected to ws-server");
        attempts = 0;
    };
    socket.onmessage = (msg) => incoming?.(msg.data.toString());
    socket.onclose = () => {
        attempts++;
        setTimeout(connect, Math.min(1000 * attempts, 5000)); // backoff, capped at 5s
    };
    socket.onerror = () => { try { socket.close(); } catch { /* */ } };
}
connect();

export function broadcast(event: unknown) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

// registers the handler for messages coming down from ws-server; survives reconnects
export function onIncoming(handler: (raw: string) => void) {
    incoming = handler;
}
