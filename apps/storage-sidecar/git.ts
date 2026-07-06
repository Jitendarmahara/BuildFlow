import { $ } from "bun";
import { WORKSPACE_DIR } from "./config";

const git = (...args: string[]) => $`git ${args}`.cwd(WORKSPACE_DIR).quiet();

export async function isRepo(): Promise<boolean> {
  return Bun.file(`${WORKSPACE_DIR}/.git/HEAD`).exists();
}

export async function initRepo() {
  await git("init", "-q");
  await git("config", "user.email", "agent@lovable.dev");
  await git("config", "user.name", "lovable");
  await commit("initial");
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
export async function cloneFromBundle(file:string){
    await $`git clone -q ${file} ${WORKSPACE_DIR}`.quiet();
}