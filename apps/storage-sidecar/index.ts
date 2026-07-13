import express from "express";
import {PORT , HOST , PROJECT_ID , RECONCILE_MS} from "./config";
import { delete_file, rename_file, write_file  , post_commit , get_conversation ,post_conversation } from "./route";
import { hydrateWorkspace } from "./hydrate";

import { reconcile } from "./reconcile";
if(!PROJECT_ID) throw new Error("PROJECT_ID is required");

const app = express();
app.use(express.json());
await hydrateWorkspace(); // this  check what to do when the pod is launched;
app.get("/health" , (_req , res)=>{
    res.send("ok");
})
app.post("/write_file" , write_file)
app.post("/rename_file" , rename_file)
app.post("/delete_file" , delete_file)
app.post("/conversation" , post_conversation)
app.get("/conversation" , get_conversation)
app.post("/commit" , post_commit)
app.listen(PORT , HOST , ()=>{
    console.log(`sidecar listining on http://${HOST}:${PORT}`)
})
// peridoic flush  to s3;
const timer = setInterval(()=>{
    reconcile().catch((e)=>console.error("reconcile failed" , e))
} , RECONCILE_MS)

process.on("SIGTERM" , async()=>{
    clearInterval(timer);
    try{
        await reconcile();
        await reconcile();
    }
    catch(e){
        console.error("final flush failed" , e);
    }
    process.exit(0);
})