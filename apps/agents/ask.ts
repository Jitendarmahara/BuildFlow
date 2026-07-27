import { broadcast } from "./stream";

const uid = Math.random().toString(36).slice(2);
const pending = new Map<string , (answer:string)=>void>();

export function askUser(question:string , options?:string[]):Promise<string>{
    const id = uid;
    broadcast({type:"question" , id , question , options});
    return new Promise<string>((resolve)=>{
        pending.set(id , resolve);
        setTimeout(()=>{
            if(pending.delete(id)) resolve("no anser - proceed with your best default")
        } , 100000)
    })
}

export function resolveAnswer(id:string , content:string){
    const resolve = pending.get(id);
    if(resolve){
        pending.delete(id);
        resolve(content)
    }
}
