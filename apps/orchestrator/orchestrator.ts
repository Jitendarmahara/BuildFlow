// boots the pods ;
import { FIELD_MANAGER } from "./config";
import {objectApi} from "./k8s"
import { pvcManifest , serviceManifest , deploymentManifest} from "./manifests"
import {PatchStrategy , type KubernetesObject}from "@kubernetes/client-node"
const NOT_FOUND = 404;

// this .patch make ths ssa (server side apply
// create-if-absetn , converge-if-diriged basically also doing hte idempotent(kind of thing)
async function apply(spec:KubernetesObject ){
    await objectApi.patch(
        spec,
        undefined,
        undefined,
        FIELD_MANAGER,
        true,
        PatchStrategy.ServerSideApply
    )
}

async function remove(spec: KubernetesObject){
    try{
        await objectApi.delete(spec)
    }catch(e){
        if(statusOf(e) === NOT_FOUND) return;
        throw new Error(`orchestrator delte failed ${statusOf(e) ?? ""} ${String(e)}`)
    }
}

export async function bootPod(projectId: string): Promise<void>{
    await apply(pvcManifest(projectId));
    await apply(deploymentManifest(projectId , 1));
    await apply(serviceManifest(projectId));
}

export async function sleepPod(projectId: string) : Promise<void>{
    await apply(deploymentManifest(projectId ,0));
}

export async function  DeleteProject(projectId: string):Promise<void>{
    await remove(serviceManifest(projectId));
    await remove(deploymentManifest(projectId , 0));
    await remove(pvcManifest(projectId));
}

function statusOf(e :unknown):number | undefined {
    return (e as any)?.code ?? (e as any) ?.statusCode;
}