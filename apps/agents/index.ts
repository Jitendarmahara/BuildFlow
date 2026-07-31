// load the meesages if not we pod we start freahs ;

import express from "express"
import { AGENT_PORT, WORKSPACE_DIR } from "./config";
import { runLoop, type Emit } from "./loop";
import { loadMessages } from "./replay";
import { sidecar } from "./sidecar";
import { ws, broadcast } from "./stream";
import { resolveAnswer } from "./ask";

// code lives in the workspace (→ git → S3), so we never persist file bodies to the
// DB. drop `content` for file tools before saving; the model re-reads current content
// via read_file. run_command output is kept — it's the only copy. this only affects
// what we STORE — the in-flight turn still has full content in context.
const FILE_BODY_TOOLS = new Set(["write_file", "read_file"]);
function withoutBody(toolName: string, payload: any) {
    if (FILE_BODY_TOOLS.has(toolName) && payload && typeof payload === "object" && "content" in payload) {
        const { content, ...rest } = payload;
        return rest;
    }
    return payload;
}

const emit : Emit = async(event)=>{
    broadcast(event); // push every event down to the browser via ws-server
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
                args : withoutBody(event.name, event.args),
                path : event.args?.path?? event.args?.to,
            })
            break;
        case "tool_result":
            await sidecar.saveMessage({
                kind:"tool_result",
                toolCallId : event.id,
                toolName: event.name,
                result: withoutBody(event.name, event.result),
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

// keep the agent alive no matter what — a failed turn must never kill the process,
// or the frontend loses its connection and can't retry.
process.on("unhandledRejection", (e) => console.error("[agent] unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("[agent] uncaughtException", e));

async function runTurn(){
    const messages = await loadMessages();
    if(messages[messages.length -1]?.role !== "user") return;
    try {
        await runLoop(messages , WORKSPACE_DIR , emit)
    } catch (e) {
        console.error("[agent] turn error", e);
        emit({ type: "error", message: String(e) }); // surface to the browser, stay alive
    }
}

async function startTurn(){
    if(running) return null;
    running = runTurn().finally(()=> {running = null});
    running.catch((e)=> console.error("turn failed" , e));
    return running;
}

ws.onmessage = async(msg)=>{
    try{
        const data = JSON.parse(msg.data.toString())
        if(data.type === "answer" && data.id){
            resolveAnswer(data.id , data.content ?? " ");
            return
        }
        if(data.type !== "user_message" || !data.content)return;
        if(running)return;
        await sidecar.saveMessage({kind:"user" , content : data.content});
        startTurn();
    }catch(e){
        broadcast({type:"error" , message: "couldnt process that try again"})
    }
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