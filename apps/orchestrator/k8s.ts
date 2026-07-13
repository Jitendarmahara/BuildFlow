import * as k8s from "@kubernetes/client-node";
const kc  = new k8s.KubeConfig();
kc.loadFromCluster(); // this is when then orchestrator is deployed
export const objectApi = k8s.KubernetesObjectApi.makeApiClient(kc);

// what i understand this whole file tells the kubertanc authentaic me once and then after  i will tell u what u have to do for me ;