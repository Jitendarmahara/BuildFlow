import { PROJECT_ID } from "./config";  
import { WebSocket} from "ws";
const WS_URL = process.env.WS_SERVER_URL ?? "ws://localhost:4042";
export const ws = new WebSocket(`${WS_URL}/ingest?projectId=${PROJECT_ID}`);
ws.onopen = ()=>console.log("stream connected to ws-server" );

export function broadcast(event:unknown){
    if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event))
}