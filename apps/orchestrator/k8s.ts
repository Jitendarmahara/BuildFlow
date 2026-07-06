import * as k8s from "@kubernetes/client-node";
const kc  = new k8s.KubeConfig();
kc.loadFromCluster(); // this is when then orchestrator is deployed
export const objectApi = k8s.KubernetesObjectApi.makeApiClient(kc);