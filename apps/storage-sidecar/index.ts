import express from "express";
import {PORT , HOST , PROJECT_ID, FLUSH_PORT } from "./config";
import { delete_file, rename_file, write_file  , post_commit , get_conversation ,post_conversation, post_worktree_add, post_worktree_merge, post_complete_merge, post_worktree_remove } from "./route";
import { hydrateWorkspace } from "./hydrate";

import { reconcile } from "./reconcile";
if(!PROJECT_ID) throw new Error("PROJECT_ID is required");

const app = express();
const drain = express();
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
app.post("/worktree/add" ,  post_worktree_add);
app.post("/worktree/merge" , post_worktree_merge);
app.post("/worktree/complete" , post_complete_merge);
app.post("/worktree/remove" , post_worktree_remove)
app.listen(PORT , HOST , ()=>{
    console.log(`sidecar listining on http://${HOST}:${PORT}`)
})

drain.post("/flush" , async(req , res)=>{
    try{
        await reconcile();
        res.json({ok:true})
    }catch(e){
        console.log("flushed failed" , e);
        res.status(500).json({error: String(e)})
    }
})


// this drain port can be listin from any where 
drain.listen(FLUSH_PORT , "0.0.0.0" , ()=>{
    console.log("siedar  drain started ")
})