import express from "express";
import {PORT , HOST , PROJECT_ID} from "./config";
import { delete_file, rename_file, write_file } from "./route";
import { hydrateWorkspace } from "./hydrate";
if(!PROJECT_ID) throw new Error("PROJECT_ID is required");

const app = express();
app.use(express.json());
await hydrateWorkspace();
app.get("/health" , (_req , res)=>{
    res.send("ok");
})
app.post("/write_file" , write_file)
app.post("/rename_file" , rename_file)
app.post("/delete_file" , delete_file)
app.listen(PORT , HOST , ()=>{
    console.log(`sidecar listining on http://${HOST}:${PORT}`)
})