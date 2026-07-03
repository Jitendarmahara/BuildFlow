// boots the pods ;
import { FIELD_MANAGER } from "./config";
import {objectApi  ,NAMESPACE} from "./k8s"
import { pvcManifest , serviceManifest , deploymentManifest} from "./manifests"
import {PatchStrategy , type KubernetesObject}from "@kubernetes/client-node"
const ALREADY_EXISTS = 409;
const NOT_FOUND = 404;


async function apply(spec:KubernetesObject ){
    await objectApi.patch(
        spec,
        undefined,
        undefined,
        FIELD_MANAGER,
        true
    )
}

async function remove(spec: KubernetesObject){
    try{
        await objectApi.delete(spec)
    }catch(e){
        throw new Error("orchestrator delte failed")
    }
}

export async function bootpod(projectId: string): Promise<void>{
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