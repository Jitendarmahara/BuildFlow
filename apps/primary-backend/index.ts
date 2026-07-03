import { Awsclient } from "@repo/storage/Awsclient";
import {client} from '@repo/db/client'
import express from "express"
import { loadTemplateFiles } from "./template";
const app = express();
app.use(express.json());
// load the files form the templates 
const templatesfile = await loadTemplateFiles();
app.post("/projects" , async(req , res)=>{
    const {prompt , userId} = req.body;
    const title = prompt.slice(0 , 50); // derive title from the prompt, not a separate field
    const project  = await client.project.create({
        data:{
            title,
            userId
        }
    })
    for(const [path , content] of Object.entries(templatesfile)){
        const s3Key = `projects/${project.id}/${path}`;
        await Awsclient.write(s3Key , content);
        await client.file.create({
            data:{
                path,
                s3Key,
                projectId: project.id
            }
        })
    }
    return res.status(200).json({
        success:true,
        project,
        prompt
    })
})

app.listen(3000 , ()=>{
    console.log("server is listining on port 3000")
})