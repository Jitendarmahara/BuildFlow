import express from "express";
import {PORT , HOST , PROJECT_ID} from "./config";
import { write_file } from "./route";
if(!PROJECT_ID) throw new Error("PROJECT_ID is required");

const app = express();
app.use(express.json());

app.get("/health" , (_req , res)=>{
    res.send("ok");
})
app.post("/write_file" , write_file)
app.listen(PORT , HOST , ()=>{
    console.log(`sidecar listining on http://${HOST}:${PORT}`)
})