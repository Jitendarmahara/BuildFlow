// the work is just to build the project
// if the projet build successfully no 
// if not then we ppas the erro to the llm 
// as usage message;

import { $ } from "bun";
export async function verifybuild(dir:string):Promise<{ok:boolean ; output:string}>{
    const r = await $`sh -c ${"bunx vite build"}`.cwd(dir).nothrow().quiet();
    const ok = r.exitCode === 0;
    const output = (r.stderr.toString() + r.stdout.toString()).split("\n").filter((l)=> !l.trimStart().startsWith("at ")).join("\n").trim() //! this makes it false so it does not keep it them in;
   // not sending the complete 
    return {ok , output: ok? "" : output.slice(0  , 3000)};
}