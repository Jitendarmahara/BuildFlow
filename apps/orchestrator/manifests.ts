import { SIDECAR_PORT , VITE_PORT , IMAGE_REGISTRY , PROJECTS_NAMESPACE } from "./config";
export function pvcManifest(projectId: string){
    return {
        apiVersion: "v1",
        kind :"PersistentVolumeClaim",
        metadata: {name: `project-${projectId}` , namespace: PROJECTS_NAMESPACE},
        spec:{
            accessModes: ["ReadWriteOnce"],
            resources: {requests: {storage: "1Gi"}},
        }
    }
}

export function deploymentManifest(projectId: string , replicas: number){
    const app = `project-${projectId}`;
    const worksapce = {name: "workspace" , mountPath : "/workspace"};

    return {
        apiVersion: "apps/v1",
        kind:"Deployment",
        metadata: {name : app , labels : {app}  , namespace: PROJECTS_NAMESPACE},
        spec: {
            replicas,
            selector : {matchLabels: {app}},
            template: {
                metadata : {labels: {app}},
                spec:{
                    volumes: [
                        {
                            name: "workspace",
                            persistentVolumeClaim : {claimName : `project-${projectId}`},
                        }
                    ],
                    containers: [
                        {
                            name: "agent",
                            image: `${IMAGE_REGISTRY}/lovable-agent:latest`,
                            imagePullPolicy: "IfNotPresent",
                            env: [
                                {name: "PROJECT_ID" , value : projectId},
                                {name: "SIDECAR_URL" , value : `http://localhost:${SIDECAR_PORT}`},
                                // the agent's ONE legitimate secret — from its own secret, not
                                // project-secrets, so it never sees the DB/S3 creds
                                {name: "DEEPSEEK_API_KEY" , valueFrom : {secretKeyRef : {name: "agent-secrets" , key: "DEEPSEEK_API_KEY"}}},
                                // the global ws-server lives in lovable-system; this pod is in projects
                                {name: "WS_SERVER_URL" , value : "ws://ws-server.lovable-system.svc.cluster.local:4042"},
                            ],
                            volumeMounts: [worksapce],
                        },
                        {
                            name:"preview-build",
                            image:`${IMAGE_REGISTRY}/lovable-preview-build:latest`,
                            imagePullPolicy: "IfNotPresent",
                            ports : [{containerPort: VITE_PORT}],
                            volumeMounts: [worksapce],
                        },
                        {
                            name: "storage-sidecar",
                            image : `${IMAGE_REGISTRY}/lovable-sidecar:latest`,
                            imagePullPolicy: "IfNotPresent",
                            env: [{name: "PROJECT_ID" , value : projectId}],
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
        metadata : {name : `preview-${projectId}` , namespace:  PROJECTS_NAMESPACE},
        spec: {
            selector : {app : `project-${projectId}`}, // mount to this pod with this projectid
            ports: [{port: VITE_PORT , targetPort : VITE_PORT}]
        }
    }
}