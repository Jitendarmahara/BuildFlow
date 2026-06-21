import { FunctionResponse, GoogleGenAI } from "@google/genai";
import {tools , SYSTEM_PROMPT} from "@repo/shared"
const root = "./scratch"
async function write_file({path , content}:{path:string , content:string}){
    await Bun.write(`${root}/${path}` , content);
    return {success:true}
}
async function run_command({command}:{command:string}){
    const outupt = await Bun.$`${{raw:command}}`.cwd(root).text();
    return {success: true , outupt};
}
async function rename_file({from , to}:{from:string , to:string}){
    await Bun.$`mv ${root}/${from} ${root}/${to}`;
    return {success:true};
}
async function delete_file({path}:{path:string}){
    await Bun.$`rm ${root}/${path}`;
    return {success:true}
}

// an store that check whic all tool calls are avaliable for me;
const handler:Record<string , (args:any)=>Promise<any>> = {
    write_file ,
    rename_file,
    delete_file,
    run_command
}
// writing the agentic loop

const ai = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
let contents:any[] = [{role:"user" , parts:[{text:"create a simple counter app"}]}]
while(true){
    const response = await ai.models.generateContent({
        model:"gemini-2.5-flash",
        contents,
        config:{
            systemInstruction: SYSTEM_PROMPT,
            tools: [{functionDeclarations: tools }]
        }
    })
    if(!response){
        break;
    }
    contents.push(response.candidates![0]!.content)
    const calls = response.functionCalls;
    if(!calls || calls.length ===0){
        console.log("Final response:" , response.text)
        break;
    }
    for(const fc of calls){
        console.log("Tool call" , fc.name , fc.args)
        const result = await handler[fc.name!]!(fc.args);
        contents.push({role:"user" , parts:[{functionResponse:{name: fc.name , response: result , id: fc.id}}]})
    }
}