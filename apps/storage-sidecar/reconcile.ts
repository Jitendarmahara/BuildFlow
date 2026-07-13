// the workof this is to update to s3 get the file change using the git.

import { Awsclient } from "@repo/storage/Awsclient";
import { PROJECT_ID, s3Key, WORKSPACE_DIR, BUNDLE_KEY, FLUSHED_KEY } from "./config";
import  * as git  from "./git";
import { client } from "@repo/db/client";

// guard so a second caller (e.g. SIGTERM) joins the in-flight run instead of being skipped
let inFlight : Promise<void > | null = null;
export async function readFlushed():Promise<string | null>{
    try{
        return (await Awsclient.file(FLUSHED_KEY).text()).trim() || null;
    }catch(e){
        return null;
    }
}
export function reconcile(): Promise<void>{
    if(inFlight) return inFlight;
    inFlight = doreconcile().finally(()=> inFlight = null);
    return inFlight;

}

export async function doreconcile(){
    await git.commit("checkpoint"); // to make sure everything got commit till know;
        const head = await  git.headSha();
        const last = await  readFlushed();
        const changes = last ? await git.changeSince(last) : [];
        for(const {status , path } of changes){
            const key = s3Key(path);
            if(status === 'D'){
                await Awsclient.delete(key);
                await client.file.deleteMany({where:{projectId : PROJECT_ID , path}});
            }else{
                const data = await Bun.file(`${WORKSPACE_DIR}/${path}`).arrayBuffer();
                await Awsclient.write(key , data);
                await client.file.upsert({
                    where : {projectId_path:{projectId: PROJECT_ID , path}},
                    create : {projectId: PROJECT_ID , path , s3Key: key},
                    update : {s3Key : key}
                })
            }
        }
        const bundlepath = `/tmp/${PROJECT_ID}.bundle`;
        await git.bundleTo(bundlepath);
        await Awsclient.write(BUNDLE_KEY , Bun.file(bundlepath))
        // sote the head to s3;
        await Awsclient.write(FLUSHED_KEY , head); 
}



