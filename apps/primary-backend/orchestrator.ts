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