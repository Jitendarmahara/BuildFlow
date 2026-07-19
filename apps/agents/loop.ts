import type OpenAI from "openai";
import { MAX_TURNS, MODEL } from "./config";
import { llm } from "./llm";
import { executeTool, tools } from "./tools";


type Msg = OpenAI.ChatCompletionMessageParam;
export type Emit = (event:{type:string ; [k:string]:any})=>void | Promise<void>
export async function runLoop(messages:Msg[] , workspaceDir:string , emit: Emit){
    // making only a specific numbner of llm calls;
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
            await emit({type:"done" , text:content})
            return content
        }

        // executing all the avaliable tool calls that llm want  us to execute;
        for(const tc of tollCalls){
            const args  = JSON.parse(tc.function.arguments || "{}")
            await emit ({type : "tool_call" , id:tc.id , name: tc.function.name , args})
            const result = await executeTool(tc.function.name , args , workspaceDir)
            await  emit ({type : "tool_result" , id: tc.id  , name: tc.function.name , result})
            messages.push({role: "tool" , tool_call_id: tc.id , content : JSON.stringify(result)});
        }
    }
    emit({type:"error" , message: "max turns reached"})
}