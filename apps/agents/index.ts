// load the meesages if not we pod we start freahs ;

import express from "express"
import { AGENT_PORT, WORKSPACE_DIR } from "./config";
import { runLoop, type Emit } from "./loop";
import { loadMessages } from "./replay";
import { sidecar } from "./sidecar";
import { error } from "node:console";
import { ws } from "./stream";

const emit : Emit = async(event)=>{
    switch(event.type){
        case "token":
            process.stdout.write(event.text);
            break;
        case "assistant":
            if(event.content){
                await sidecar.saveMessage({kind:'assistant' , content: event.content});
            }
            break;
        case "tool_call":
            await sidecar.saveMessage({
                kind: "tool_call",
                toolCallId: event.id,
                toolName: event.name,
                args : event.args,
                path : event.args?.path?? event.args?.to,
            })
            break;
        case "tool_result":
            await sidecar.saveMessage({
                kind:"tool_result",
                toolCallId : event.id,
                toolName: event.name,
                result: event.result,
            });
            break
        case "done":{
            const {sha} = await sidecar.commit("agent changes");
            await sidecar.saveMessage({
                kind :"assistant",
                content : event.text,
                commitSha : sha ?? undefined
            });
            break;
        }
    }
}

let running: Promise<void> | null = null;

async function runTurn(){
    const messages = await loadMessages();
    if(messages[messages.length -1]?.role !== "user") return;
    await runLoop(messages , WORKSPACE_DIR , emit)
}

async function startTurn(){
    if(running) return null;
    running = runTurn().finally(()=> {running = null});
    running.catch((e)=> console.error("turn failed" , e));
    return running;
}

ws.onmessage = async(msg)=>{
    const data = JSON.parse(msg.toString())
    if(data.type !== "user_message" || !data.content)return;
    if(running)return;
    await sidecar.saveMessage({kind:"user" , content : data.content});
    startTurn();
}

const app = express();
app.use(express.json());


app.post("/message" , async (req , res)=>{
    if(running){
        return res.status(409).json({
            error:"bussy in  working"
        })
    }
    const {content} =  req.body ?? {};
    if(!content) return res.status(409).json({error: "content required"});
    // need to think a better over her ;
    await sidecar.saveMessage({kind:"user" , content});
    startTurn(); // ther response will be send through the websocket server 
    res.json({ok:true})
})

app.listen(AGENT_PORT , ()=>{
    console.log(`agent listening on http://localhost:${AGENT_PORT}`)
})
startTurn();