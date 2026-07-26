import { relative, resolve, sep } from "path";
import { WORKSPACE_DIR } from "./config";
import { WORKTREES_DIR } from "./git";

function allowedRoot(base:string):boolean{
    return base === resolve(WORKSPACE_DIR) || base.startsWith(resolve(WORKTREES_DIR)+ sep)
}

export function resolveInWorkspace(path:string , root:string = WORKSPACE_DIR): {abs:string ; rel:string}{
if(!path || path.includes("\0")){
    throw new Error("invalid path")
}
const base  = resolve(root);
    if(!allowedRoot(base)){
        throw new Error(`root not allowd : ${root}`)
    }
const abs = resolve(base , path);
if(!abs.startsWith(base + sep)){
    throw new Error(`path escapes workspace: ${path}`)  
}
const rel= relative(base , abs);

return {abs  , rel}
}