import {resolve , relative , sep} from "path"
import { WORKSPACE_DIR } from "./config"

export function resolveInWorkspace(path:string):{abs:string , rel:string}{
    if(!path || path.includes ("\0")){
        throw new Error("invalid path")
    }

    const abs = resolve(WORKSPACE_DIR , path);
    if(!abs.startsWith(WORKSPACE_DIR + sep)){
        throw new Error(`path escapes workspace: ${path}`)
    }
    const rel= relative(WORKSPACE_DIR , abs);

    return {abs , rel}
}