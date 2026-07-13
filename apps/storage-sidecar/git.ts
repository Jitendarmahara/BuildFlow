import { $ } from "bun";
import { WORKSPACE_DIR } from "./config";

export const git = (...args: string[]) => $`git ${args}`.cwd(WORKSPACE_DIR).quiet();

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