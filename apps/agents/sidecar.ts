// this files tels how to talk to the sidecar agent;

import { SIDECAR_URL } from "./config"
type SaveMessageInput = {
  kind: "user" | "assistant" | "tool_call" | "tool_result";
  content?: string;
  toolName?: string;
  path?: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
  commitSha?: string;
  taskId?: string;
};

export async function post(path:string ,  body: unknown){
    const res = await fetch(`${SIDECAR_URL}${path}` , {
        method: "POST",
        headers: {"Content-Type": "application/json" },
        body : JSON.stringify(body)
    })
    if(!res.ok){
        throw new Error(`${path} failed stauts is ${res.status}`)
    }
    return res.json();
}

export async function get(path:string ){ 
    const res = await fetch(`${SIDECAR_URL}${path}`);
    if(!res.ok){
        throw new Error(`${path} failed  status is ${res.status}`)
    }
    return res.json()
}

// its has all the utitliy functions 
export const sidecar = {
    writeFile : (path:string , content:string) =>  post("/write_file" , {path , content}) ,
    deleteFile : (path:string)=> post("/delete_file" , {path}),
    renameFile : (from:string , to:string)=> post("/rename_file" , {from , to}) ,
    saveMessage : (input:SaveMessageInput) => post("/conversation" , input),
    getConversation : ()=> get("/conversation"),
    commit: (message: string) => post("/commit", { message }),
}