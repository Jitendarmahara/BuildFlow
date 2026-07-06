import { client } from "@repo/db/client";
import { PROJECT_ID } from "./config";
import { resolveInWorkspace } from "./workspace";
import { Awsclient } from "@repo/storage/Awsclient";

export async function hydrateWorkspace(){
    const files = await client.file.findMany({where: {projectId:PROJECT_ID}});

    for(const f of files){
        try{
            const {abs} = resolveInWorkspace(f.path);
            const data = await Awsclient.file(f.s3Key).arrayBuffer();
            await Bun.write(abs , data); // this is writing to pvc 
        }catch(e){
            console.error(`hydrate failed for ${f.path}` , e)
        }
    }
}