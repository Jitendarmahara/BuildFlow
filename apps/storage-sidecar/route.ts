import type { Request, Response } from "express";
import { resolveInWorkspace } from "./workspace";
import {client} from "@repo/db/client";
import { Awsclient } from "@repo/storage/Awsclient";
import { PROJECT_ID, s3Key } from "./config";
import { mkdir , rename } from "node:fs/promises";
import { dirname } from "path";

export async function write_file(req:Request , res:Response){
    const {path , content}  = req.body;
    if(typeof path !== 'string' || typeof content !== 'string'){
        return res.status(400).json({error:"path and content must be strings"})
    }
    let target : {abs:string  ; rel :string}
    try{
        target = resolveInWorkspace(path); // checking if the path is correct or not ; 
    }catch(e){
        return res.status(400).json({error:"invalid path"})
    }
    // write to the pvc 
    try{
        await Bun.write(target.abs , content); // this shoudl write to pvc 
        const key = s3Key(target.rel);
        await Awsclient.write(key , content);

        // update the file row 

        await client.file.upsert({
            where:{projectId_path:{projectId: PROJECT_ID , path: target.rel }},
            create: {projectId : PROJECT_ID , path: target.rel , s3Key:key},
            update : {s3Key: key},
        })
        return res.json({ok:true , path : target.rel})
    }
    catch(e){
        console.error("write_file failed" , e);
        return res.status(500).json({error:"write_failed"})
    }
}

export async function rename_file(req:Request , res:Response){
    const {from , to} = req.body;
    if(typeof from !== 'string' || typeof to !== 'string'){
        return res.status(400).json({
            error:"form or to must be string"
        })
    }
    let src : {abs:string , rel:string}
    let dst : {abs:string , rel:string}
    try{
        src = resolveInWorkspace(from);
        dst = resolveInWorkspace(to);
    }catch(e){
        return res.status(400).json({error:"invalid path"});
    }
    // try updating the fiels in all the places;
    try{
        // check if the dir exits or not ;
        await mkdir(dirname(dst.abs) , {recursive: true});
        await rename(src.abs , dst.abs)

        const fromkey = s3Key(src.rel);
        const tokey = s3Key(dst.rel);
        const data = await Bun.file(dst.abs).arrayBuffer();
        await Awsclient.write(tokey , data);
        await Awsclient.delete(fromkey)

        await client.file.update({
            where: {projectId_path:{projectId:PROJECT_ID , path: src.rel}},
            data: {path: dst.rel , s3Key: tokey}
        })
    }catch(e){
        
    }
}