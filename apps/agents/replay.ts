// it generate the rows back to opeani message form that are need buy openai;
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import { sidecar } from "./sidecar";

type Msg = OpenAI.ChatCompletionMessageParam;

type Row = {
    kind : "user" | "assistant" |  "tool_call"  | "tool_result";
    content : string | null;
    toolName:  string | null;
    toolCallId : string | null;
    args: unknown ;
    result :unknown;
}

// help to convert the messages back to the llm format so we re create the llm memor;
export function rwosToMessages(rows: Row[]):Msg[]{
    const messages:Msg[] = [{role: "system" , content: SYSTEM_PROMPT}];
    let open: OpenAI.ChatCompletionAssistantMessageParam | null = null;
    for(const row of rows ){
        switch(row.kind){
            case "user":
                open = null;
                messages.push({role:"user" , content: row.content ?? ""});
                break;

            case "assistant":
                open = {role:"assistant" , content: row.content ?? null};
                messages.push(open);
                break;
            case "tool_call":
                if(!row.toolCallId || !row.toolName)break;
                if(!open){
                    open = {role:"assistant" , content:null};
                    messages.push(open)
                }
                (open.tool_calls ??= []).push({
                    id: row.toolCallId,
                    type : "function",
                    function : {name : row.toolName , arguments : JSON.stringify(row.args ?? {})},
                });
                break;
            case "tool_result":
                open = null;
                messages.push({
                    role:"tool",
                    tool_call_id : row.toolCallId ?? "",
                    content : JSON.stringify(row.result ?? {}),

                });
                break;
        }
    }
    return messages;
}

export async function loadMessages():Promise<Msg[]>{
    const {message} = (await sidecar.getConversation())as {message: Row[]}; // get the conversation from the sidcar with thsi endpoint;
    return rwosToMessages(message);
}