import { $ } from "bun";
import { WORKSPACE_DIR } from "./config";
import { join, relative, sep } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolve } from "path";
import type { throws } from "node:assert";

export const WORKTREES_DIR = `${WORKSPACE_DIR}-worktrees`;
const subpath = (id:string)=> join(WORKTREES_DIR  , id);
const subBranch = (id:string)=> `sub/${id}`;


export const git = (...args: string[]) => $`git ${args}`.cwd(WORKSPACE_DIR).quiet();

export async function worktreeAdd(id:string):Promise<string>{
    await mkdir(WORKTREES_DIR , {recursive:true});
    const path = subpath(id);
    await git("worktree" , "add" , "-q" , "-b" , subBranch(id) , path , "HEAD");
    return path;
}

export async function worktreeMerge(id:string):Promise<{ok:boolean , conflict:boolean , files:string[]}>{
    const res = await $`git merge --no-edit ${subBranch(id)}`.cwd(WORKSPACE_DIR).nothrow().quiet();
    if(res.exitCode === 0){
        return {ok:true , conflict:false , files:[]}
    }
    // else we are sur that her is  a confit and we send all the issue form here to the llm;
    const out = (await $`git diff --name-only --diff-filter=U`.cwd(WORKSPACE_DIR).quiet().text()).trim();
    const files = out ? out.split("\n"): [];
    if(files.length === 0){
        await $`git merge --abort`.cwd(WORKSPACE_DIR).nothrow().quiet();
        return {ok:false , conflict:false , files:[]}
    }
    return {ok:false , conflict :true , files}
}
export async function completeMerge():Promise<{sha:string}>{
    await $`git add -A`.cwd(WORKSPACE_DIR).nothrow().quiet();
    // explicit -m so an empty MERGE_MSG can't abort the commit; tolerate a no-op merge
    const r = await $`git commit -m ${"resolve subagent merge"}`.cwd(WORKSPACE_DIR).nothrow().quiet();
    if(r.exitCode !== 0){
        const err = (r.stderr.toString() || r.stdout.toString());
        if(!/nothing to commit/i.test(err)) throw new Error(`git commit failed: ${err.trim()}`);
    }
    return {sha: await headSha()}
}

export async function worktreeRemove(id:string):Promise<void>{
    await $`git worktree remove --force ${subpath(id)}`.cwd(WORKSPACE_DIR).nothrow().quiet();
    await $`git branch -D ${subBranch(id)}`.cwd(WORKSPACE_DIR).nothrow().quiet();
}

export async function isRepo(): Promise<boolean> {
  return Bun.file(`${WORKSPACE_DIR}/.git/HEAD`).exists();
}
export async function setIdentity(){
    await git("config" , "user.email" , "agent@lovable.dev")
    await git("config" , "user.name" , "lovable")
}

export async function initRepo() {
  await git("init", "-q" , "-b" , "main");
  await setIdentity();
  await git ("add" , "-A");
  await git("commit" , "--allow-empty" , "-q" , "-m" , "initial");
}
export async function commit(message: string): Promise<boolean> {
  await git("add", "-A");
  const status = (await git("status", "--porcelain").text()).trim();
  if (!status) return false;
  await git("commit", "-q", "-m", message);
  return true;
}
export async function headSha(): Promise<string>{
    return (await git("rev-parse" , "HEAD").text()).trim();
}

export type Change = {status : "A" | "M" | "D" ; path: string};

export async function  changeSince(sha: string): Promise<Change[]>{
    const out = (await git("diff" , "--name-status" , "--no-renames" , sha , "HEAD").text()).trim();
    if(!out)return [];
    return out.split("\n").map((line) => {
        const [status, path] = line.split("\t");
        return { status: status![0] as Change["status"], path: path! };
    });
}

export async function bundleTo(file: string){
    await git("bundle" , "create" , file , "--all");  // -all inclued history + our refs
}

export async function restoreFromBundle(file:string){
    await git ("init" , "-q" , "-b" , "main");
    await setIdentity();
    await git("fetch" , "-q" , file , "main");
    await git ("reset" , "--hard" , "FETCH_HEAD")
}
