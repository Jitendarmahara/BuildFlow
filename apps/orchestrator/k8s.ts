import * as k8s from "@kubernetes/client-node";
const kc  = new k8s.KubeConfig();
kc.loadFromCluster(); // this is when then orchestrator is deployed
export const coreApi = kc.makeApiClient(k8s.CoreV1Api); // it have the pod , 
export const appsApi = kc.makeApiClient(k8s.AppsV1Api);// deployment  , replicaset
export const NAMESPACE = process.env.PROJECT_NAMESPACE ?? "projects";