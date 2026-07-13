import { client } from "@repo/db/client";
import { PROJECT_ID, BUNDLE_KEY, FLUSHED_KEY } from "./config";
import { resolveInWorkspace } from "./workspace";
import { Awsclient } from "@repo/storage/Awsclient";
import * as git  from "./git";

export async function hydrateWorkspace(){
    // 1. warm restart — repo already on the PVC, nothing to do
    if(await git.isRepo()) return;

    // 2. returning project on a fresh PVC — restore files + history from the bundle
    if(await Awsclient.file(BUNDLE_KEY).exists()){
        const bundlepath = `/tmp/${PROJECT_ID}.restore.bundle`;
        await Bun.write(bundlepath , await Awsclient.file(BUNDLE_KEY).arrayBuffer());
        await git.restoreFromBundle(bundlepath);
        return;
    }

    // 3. brand-new project — download the per-file seed, THEN init + set baseline
    const files = await client.file.findMany({
        where:{
            projectId :  PROJECT_ID
        }
    })
    for( const f of files){
        try{
            const {abs} = resolveInWorkspace(f.path);
            const data = await Awsclient.file(f.s3Key).arrayBuffer();
            await Bun.write(abs , data);
        }catch(e){
            console.error(`hydrate failed for ${f.path}` , e)
        }
    }
    await git.initRepo();
    await Awsclient.write(FLUSHED_KEY , await git.headSha());
}