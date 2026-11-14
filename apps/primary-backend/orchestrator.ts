const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:5000";
export async function bootpod(projectId:string ): Promise<void>{
    const res = await fetch(`${ORCHESTRATOR_URL}/bootPod` , {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({projectId}),
    });
    if(! res.ok){
        throw new Error(`bootPod failed : ${res.status} ${await res.text()}`)
    }
}

// Tear down a project's live k8s resources (service + deployment + PVC). The orchestrator's
// DeleteProject already treats a 404 as success, so this is safe whether the project is running,
// sleeping, or already archived (nothing left to remove).
export async function killproject(projectId: string): Promise<void> {
    const res = await fetch(`${ORCHESTRATOR_URL}/killproject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
        throw new Error(`killproject failed : ${res.status} ${await res.text()}`);
    }
}