export function pvcManifest(projectId: string){
    return {
        apiVersion: "v1",
        kind :"PersistentVolumeClaim",
        metadata: {name: `project-${projectId}`},
        spec:{
            accessModes: ["ReadWriteOnce"],
            resources: {requests: {storage: "1Gi"}},
        }
    }
}
const REGISTRY = process.env.REGISTRY || "";
const SIDECAR_PORT = 4000;
const VITE_PORT = 5137;
export function deploymentManifest(projectId: string){
    const app = `porject-${projectId}`;
    const worksapce = {name: "workspace" , mountpath : "/workspace"};

    return {
        apiVersion: "apps/v1",
        kind:"Deployment",
        metadata: {name : app , labels : {app}},
        spec: {
            replicas: 1,
            selector : {matchLabels: {app}},
            template: {
                metadata : {labels: {app}},
                spec:{
                    volumes: [
                        {
                            name: "worksapce",
                            persistentVolumeClaim : {ClaimName : `project-${projectId}`},
                        }
                    ],
                    containers: [
                        {
                            name: "agent",
                            image: `${REGISTRY}/lovable-agent:latest`,
                            env: [
                                {name: "PROJECT_ID" , value : projectId},
                                {name: "SIDECAR_URL" , value : `http://localhost:${SIDECAR_PORT}`}
                            ],
                            volumeMounts: [worksapce],
                        },
                        {
                            name:"preview-build",
                            image:`${REGISTRY}/lovable-sidecar:latest`,
                            ports : [{containerPort: VITE_PORT}],
                            volumeMounts: [worksapce],
                        },
                        {
                            name: "storage-sidecar",
                            image : `${REGISTRY}/lovable-sidecar:latest`,
                            env: [{name: "project_ID" , value : projectId}],
                            envFrom :[{secretRef: {name: "project-secrets"}}],
                            volumeMounts: [worksapce],
                        }
                    ]
                }
            }
        }
    }
}

export function  serviceManifest(projectId:string){
    return {
        apiVersion : "v1",
        kind : "Service",
        metadata : {name : `preview-${projectId}`}
    }
}