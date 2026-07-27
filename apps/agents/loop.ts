import type OpenAI from "openai";
import { MAX_SUBAGENTS, MAX_TURNS, MODEL, WORKSPACE_DIR } from "./config";
import { llm } from "./llm";
import { executeTool, tools } from "./tools";
import { verifybuild } from "./verify";
import { sidecar } from "./sidecar";
import { broadcast } from "./stream";
import { CONFLICT_RESOLVER_PROMPT, SUBAGENT_PROMPT } from "./prompt";
import { $ } from "bun";
const MAX_FIXES = 3;

type Msg = OpenAI.ChatCompletionMessageParam;
export type Emit = (event:{type:string ; [k:string]:any})=>void | Promise<void>
export async function runLoop(messages:Msg[] , workspaceDir:string , emit: Emit , verify: boolean = true){
    // making only a specific numbner of llm calls;
    let fixes = 0;
    for(let turn =0 ; turn < MAX_TURNS ; turn++){
        const stream = await llm.chat.completions.create({
            model :MODEL,
            messages,
            tools,
            stream:true
        })

        let content = "";
        const tollCalls:any[] = [];
        for await (const chunk of stream){
            const delta = chunk.choices[0]?.delta ;
            if(delta?.content){
                content += delta.content;
                emit ({type :"token" , text: delta.content});
            }
            // know we have the tool_call to register 
            if(delta ?.tool_calls){
                for(const tc of delta.tool_calls){
                    const i = tc.index  // this thing heple me to correclty build the toolcall properly;
                    tollCalls[i] ??= {id :"" , type:"function" , function :{name:"" , arguments: ""}};
                    if(tc.id) tollCalls[i].id = tc.id;
                    if(tc.function?.name) tollCalls[i].function.name = tc.function.name;
                    if(tc.function?.arguments) tollCalls[i].function.arguments += tc.function.arguments;
                }
            }
        }
        messages.push({
            role : "assistant",
            content : content || null,
            ...(tollCalls.length ? {tool_calls: tollCalls}: {}),
        }as Msg)
        // break the loop if nothing is there
        if(tollCalls.length === 0){
            // no tocall we try to have a look that every thing is fix or not;
            if(verify){
            const check = await verifybuild(workspaceDir);
            if(!check.ok && fixes < MAX_FIXES){
                fixes++;
                emit({type :"verify" , ok:false , attempt:fixes});
                messages.push({
                    role:"user",
                    content:`the app failed to build.fix these errors and nothignels
                     then finsis:\n\n${check.output}`
                });
                continue;
            }
        }
            await emit({type:"done" , text:content})
            return content
        }

        // executing all the avaliable tool calls that llm want  us to execute;
        for(const tc of tollCalls){
            let args: any = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; } // bad tool args → don't crash
            await emit ({type : "tool_call" , id:tc.id , name: tc.function.name , args})
            let result: any;
            try {
                result = tc.function.name ==='spawn_subagents' ? await runSubagents(args.subtasks ?? [] , emit)   :   await executeTool(tc.function.name , args , workspaceDir)
            } catch (e) {
                // a single tool failure feeds back to the LLM (it can retry/adjust) — it must NOT kill the turn
                result = { ok: false, error: String(e) };
            }
            await  emit ({type : "tool_result" , id: tc.id  , name: tc.function.name , result})
            messages.push({role: "tool" , tool_call_id: tc.id , content : JSON.stringify(result)});
        }
    }
    emit({type:"error" , message: "max turns reached"})
}

async function runsubagent(id:string , subtaks:string):Promise<string>{
    const {path} = await sidecar.worktreeAdd(id);
    const subEmit:Emit = (event)=>broadcast({...event , agent:id});
    const messages:Msg[] = [
        {role: "system" , content: SUBAGENT_PROMPT},
        {role:"user" , content : subtaks},

    ];
    const summry = await runLoop(messages , path , subEmit , false);
    await $`git add -A && git commit -q -m ${`subagent${id}`}`.cwd(path).nothrow().quiet();
    return summry ?? "";
}

async function runSubagents(subtask:{id:string , description:string}[] , emit:Emit){
    if(subtask.length > MAX_SUBAGENTS){
        return {ok:false , error:`You requested ${subtask.length} sub-agents but the max is ${MAX_SUBAGENTS}. Call spawn_subagents again with at most ${MAX_SUBAGENTS} file-disjoint subtasks, and build or delegate the rest afterward.`}
    }
    await sidecar.commit("checkpoint befor subagents"); // the problem i faced here was that every subagetnt try to crate diff fn so then the main have to fix it
    // beter cretate the overview over in the main fille and let the subages user them ;
    const settled = await Promise.allSettled(
        subtask.map(async (x)=> ({id:x.id , summary :  await runsubagent(x.id , x.description)}))
    );
    const built = settled.map((r , i)=>
        r.status === "fulfilled" ? r.value : {id: subtask[i]!.id , summary:`(subagent failed: ${r.reason})`}
    );
    const merges: any [] = [];
    for(const t of subtask){
        try {
            const res = await sidecar.worktreeMerge(t.id);
            if(res.conflict) await resolveConflict(res.files); // llm fixes conflicts
            merges.push({id:t.id , ...res});
        } catch (e) {
            merges.push({id:t.id , ok:false , error:String(e)}); // a bad merge is data, not a crash
        } finally {
            await sidecar.worktreeRemove(t.id).catch(()=>{}); // rhia ia to clean the repo
        }
    }
    return {ok:true , subagents : built , merges}
}

async function resolveConflict(files: string[]):Promise<void>{
    const resolveEmit : Emit = (event) =>  broadcast({...event , agent: "resolver"})

    const messages:Msg[] = [
        {role:"system" , content: CONFLICT_RESOLVER_PROMPT},
        {role: "user" , content : `these files have merge conflicts - reslove each and write it back merged:\n${files.join("\n")}`}
    ];

    await runLoop (messages , WORKSPACE_DIR , resolveEmit , false);
    await sidecar.completeMerge();
}