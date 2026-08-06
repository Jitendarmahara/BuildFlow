// load the meesages if not we pod we start freahs ;

import express from "express"
import { AGENT_PORT, WORKSPACE_DIR, SIDECAR_URL } from "./config";
import { runLoop, type Emit } from "./loop";
import { loadMessages } from "./replay";
import { sidecar } from "./sidecar";
import { ws, broadcast } from "./stream";
import { resolveAnswer } from "./ask";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type OpenAI from "openai";

// Tier 0: the FULL in-memory conversation context for this project's pod.
// built once on boot from the DB, then kept + appended in memory — never re-read per turn.
type Msg = OpenAI.ChatCompletionMessageParam;
let history: Msg[] = [];

// read-only workspace views for the frontend code panel (served over the ws up-channel).
const VIEW_SKIP = new Set(["node_modules", ".git", "dist", ".worktrees"]);
async function listFiles(dir: string, base = ""): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
        if (VIEW_SKIP.has(e.name)) continue;
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...(await listFiles(join(dir, e.name), rel)));
        else out.push(rel);
    }
    return out.sort();
}
async function readFileSafe(dir: string, p: string): Promise<string> {
    const b = resolve(dir);
    const full = resolve(dir, p);
    if (full !== b && !full.startsWith(b + "/")) return "";
    const f = Bun.file(full);
    return (await f.exists()) ? await f.text() : "";
}


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
        // a turn that ended badly still ended. the broadcast above only reaches whoever is
        // watching right now — reload after it and the newest stored row is a tool_call,
        // which the page reads as "a turn is still in flight" and spins forever on a pod
        // that stopped working long ago. MessageKind has no error variant, and assistant
        // is the honest one anyway: this text is how the turn ended, and replay should
        // hand it back to the model as the last thing it said.
        case "error":
            await sidecar.saveMessage({ kind: "assistant", content: `turn failed: ${event.message}` });
            break;
    }
}

let running: Promise<void> | null = null;

// keep the agent alive no matter what — a failed turn must never kill the process,
// or the frontend loses its connection and can't retry.
process.on("unhandledRejection", (e) => console.error("[agent] unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("[agent] uncaughtException", e));

async function runTurn(){
  
    if(history[history.length -1]?.role !== "user") return;
    try {
        await runLoop(history , WORKSPACE_DIR , emit)
    } catch (e) {
        console.error("[agent] turn error", e);
        // awaited so the durable write lands before the turn is marked finished; if the
        // sidecar is down too, startTurn's catch logs it and the process stays alive.
        await emit({ type: "error", message: String(e) });
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
        // read-only code views — work even while a turn is running
        if(data.type === "list_files"){
            broadcast({type:"files", files: await listFiles(WORKSPACE_DIR)});
            return
        }
        if(data.type === "read_file" && data.path){
            broadcast({type:"file_content", path: data.path, content: await readFileSafe(WORKSPACE_DIR, data.path)});
            return
        }
        if(data.type !== "user_message" || !data.content)return;
        // a turn is already in flight. the browser renders the bubble the moment you hit
        // send, so returning quietly leaves a message on screen that was never received —
        // and it is gone on the next reload, because nothing was saved. say so instead.
        // /message already answers 409 for the same case; this is the socket's version.
        if(running){
            broadcast({type:"busy" , message:"still finishing the last message — send this once it is done"});
            return;
        }
        history.push({role:"user" , content: data.content});
        await sidecar.saveMessage({kind:"user" , content : data.content}); // DB (durable minimum)
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
    history.push({role:"user" , content}); 
    await sidecar.saveMessage({kind:"user" , content}); 
    startTurn(); // ther response will be send through the websocket server
    res.json({ok:true})
})

app.listen(AGENT_PORT , ()=>{
    console.log(`agent listening on http://localhost:${AGENT_PORT}`)
})

async function waitForSidecar(){
    for(let i = 0; i < 60; i++){
        try{ if((await fetch(`${SIDECAR_URL}/health`)).ok){ console.log("sidecar ready"); return; } }catch{ /* not up yet */ }
        await Bun.sleep(1000);
    }
    console.error("sidecar not ready after 60s — starting anyway");
}
await waitForSidecar();
history = await loadMessages(); // cold-start / resume: build context ONCE from the DB
startTurn();