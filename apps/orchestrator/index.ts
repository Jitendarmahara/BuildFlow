import express, { type Request, type Response } from "express";
import { bootPod , sleepPod , DeleteProject } from "./orchestrator";
const app = express();
app.use(express.json());
function handle(action:(id:string)=>Promise<void>){
    return async(req:Request , res:Response)=>{
        const {projectId} = req.body;
        if(!projectId){
            return res.status(400).json({
                error:"projectId requried"
            })
        }
        try{
            await action(projectId);
            return res.status(200).json({ok:true})
        }catch(e){
            console.log("error" , e);
            return res.status(500).json({error: String(e)})
        }
    }
}

app.post("/bootPod" , handle(bootPod));
app.post("/sleep" , handle(sleepPod));
app.post("/killproject" , handle(DeleteProject));
app.get("/health" , (_req , res)=> res.send("Ok"))

app.listen(5000 , ()=> console.log("orchestrator listenig on  :5000"))