import type { Request, Response } from "express";
import { resolveInWorkspace } from "./workspace";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "path";
import {client} from "@repo/db/client"
import type {MessageKind} from "@repo/db/client"
import { PROJECT_ID } from "./config";
import * as git from "./git"

export async function write_file(req: Request, res: Response) {
  const { path, content } = req.body;
  if (typeof path !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "path and content must be strings" });
  }
  let target: { abs: string; rel: string };
  try {
    target = resolveInWorkspace(path); // checking if the path is correct or not ;
  } catch (e) {
    return res.status(400).json({ error: "invalid path" });
  }
  // write to the pvc
  try {
    await Bun.write(target.abs, content); // this shoudl write to pvc
    return res.json({ ok: true, path: target.rel });
  } catch (e) {
    console.error("write_file failed", e);
    return res.status(500).json({ error: "write_failed" });
  }
}

export async function rename_file(req: Request, res: Response) {
  const { from, to } = req.body;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({
      error: "form or to must be string",
    });
  }
  let src: { abs: string; rel: string };
  let dst: { abs: string; rel: string };
  try {
    src = resolveInWorkspace(from);
    dst = resolveInWorkspace(to);
  } catch (e) {
    return res.status(400).json({ error: "invalid path" });
  }
  // try updating the fiels in all the places;
  try {
    // check if the dir exits or not ;
    await mkdir(dirname(dst.abs), { recursive: true });
    await rename(src.abs, dst.abs);
    return res.json({ ok: true, from: src.rel, to: dst.rel });
  } catch (e) {
    console.error("rename_file failed", e);
    return res.status(500).json({ error: "rename failed" });
  }
}
export async function delete_file(req: Request, res: Response) {
  const { path } = req.body;
  if (typeof path !== "string") {
    return res.status(400).json({ error: "path must be a string" });
  }

  let target: { abs: string; rel: string };
  try {
    target = resolveInWorkspace(path);
  } catch {
    return res.status(400).json({ error: "invalid path" });
  }

  try {
    await unlink(target.abs).catch(() => {}); // PVC — ignore if already gone
    return res.json({ ok: true, path: target.rel });
  } catch (e) {
    console.error("delete_file failed", e);
    return res.status(500).json({ error: "delete failed" });
  }
}

// this update the db for the agent llm calls;
export async  function post_conversation(req:Request , res: Response){
    const {kind  , toolName, content  , path , toolCallId , args , result , commitSha} = req.body ?? {};
    const vlaues: MessageKind[] =["user" , "tool_call" , "assistant" , "tool_result" ]
    if(!vlaues.includes(kind)){
        return res.status(400).json({error:"invalid kind"})
    }
    // this will update the 
    try{
        const msg = await client.message.create({
            data:{
                kind ,
                content : content ?? null,
                path : path ?? null,
                projectId: PROJECT_ID,
                toolCallId : toolCallId ?? null,
                args : args ?? undefined,
                result : result  ?? undefined,
                commitSha : commitSha ?? null,
                toolName : toolName ?? null

            }
        })
        return res.json({ok:true , id: msg.id})
    }
    catch(e){
        return res.status(500).json({error : "falied to save messages"})
    }
}
// get/conversaion / this is used by the llm to buidd its memory;
export async function get_conversation(_req:Request , res:Response){
    // for this project get all the conversaion of 
    try{
        const message = await client.message.findMany({
            where :{
                projectId :PROJECT_ID
            },
            orderBy: {createdAt:"asc"},
        })
      return res.json({message})
    }
    catch(e){
        return res.status(500).json({error:"failed to fetch the conversation"})
    }
}
// each time when llm send its response i need to put a commit 
export async function post_commit(req:Request , res:Response){
    // what to commit comes in message if not add simpley aegent;
    const {message} = req.body ?? {};
    const msg = typeof message === 'string' && message.trim() ? message : "agent data";
    try{
        const changes = await git.commit(msg);
        const sha = changes ? await git.headSha(): null;
        return res.json({ok:true , committed : changes , sha})
    }
    catch(e){
        return res.status(500).json({error:"commit failed"})
    }
}