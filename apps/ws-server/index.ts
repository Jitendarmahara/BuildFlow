import express from "express"
import { Socket } from "node:dgram";
import { createServer } from "node:http";
import {WebSocketServer  , type WebSocket} from "ws";
const app = express();


const server = createServer(app);
const wss = new WebSocketServer({noServer: true});

// ecah  proiject have one agent socket and multiple browser socket;

type Room = {agent:WebSocket | null ; browser: Set<WebSocket>};
const rooms = new Map<string , Room>();

function room(id:string):Room{
    if(!rooms.get(id)){
        rooms.set(id , {agent:null , browser : new Set()})
    }
    return rooms.get(id)!
}

server.on("upgrade" , (req , socket , head)=>{
    const url = new URL(req.url ?? "" , "http://localhost");
    const projectId  = url.searchParams.get("projectId");
    const path = url.pathname;
    if(!projectId || (path !== "/ingest" && path !== "/subscribe"))return socket.destroy();

    wss.handleUpgrade(req , socket , head , (ws)=>{
        const r = room(projectId);
        if(path === '/ingest'){
            r.agent = ws;
        ws.on("message" , (data)=>{
            const msg = data.toString();
            for(const b of r.browser){
                if(b.readyState === b.OPEN) b.send(msg);
            }
        });
        ws.on("close" , ()=> {if(r.agent === ws) r.agent = null});
    }else{
        // a browser is watichign for the project;
        r.browser.add(ws);
        ws.on("message" , (data)=>{
            const a = r.agent;
            if(a && a.readyState === a.OPEN){
                a.send(data.toString());
            }
        });
        ws.on("close" , ()=> console.log(`ws-server on http://localhost:4042`))
    }
    })
})
