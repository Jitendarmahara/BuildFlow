import { client } from "@repo/db/client";
async function ensureDb() {
  for (let i = 0; ; i++) {
    try { await client.$queryRaw`SELECT 1`; return; }
    catch (e) {
      if (i >= 5) throw e;
      await Bun.sleep(500 * (i + 1));                 
    }
  }
}
await ensureDb();


const IDLE_MS = Number(process.env.IDLE_MINUTES ?? 15) * 60_000;
const ARCHIVE_MS = Number(process.env.ARCHIVE_MINUTES ?? 60) * 60_000 ; // 24hours 
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://orchestrator:5000";

async function call (path:string , projectId:string){
  const res = await fetch(`${ORCHESTRATOR_URL}${path}` , {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({projectId}),
  });
  if(!res.ok){
    throw new Error("falied to call the orchestrator")
  }
  
}

async function idelSince(projectId:string , createdAt:Date):Promise<number>{
  const last = await client.message.findFirst({
    where :{projectId}, orderBy:{createdAt: "desc"} , select:{createdAt:true}
  });
  return (last?.createdAt ?? createdAt).getTime();
}

const now = Date.now();
// all the runnign porject here ;
const running = await client.project.findMany({ where: { status: "running" } });
console.log(`reaper: ${running.length} running project(s), idle cutoff ${now.toString()}`);
// this makes the pods sleep basicaly kill the pod only;
for (const p of running) {
  if(await idelSince(p.id , p.createdAt) < now- IDLE_MS){
    try{
      await call("/sleep" , p.id);
      await client.project.update({where:{id:p.id}, data:{status:"sleeping"}});

    }catch(e){
      console.log(`sleep failed ${p.id}`, e);
    }
  }
}
//this basically does to kill all the pods that have basicaly passed the time limit;
const sleeping= await client.project.findMany({where:{status:"sleeping"}})
for(const p of sleeping){
  try{
    if(p.updatedAt.getTime() < now - ARCHIVE_MS){
      await call("/killproject" , p.id);
      await client.project.update({
        where:{
          id:p.id
        },
        data:{status:"archived"}
      })
    }
  }catch(e){
    console.log("failed to kill the pod")
  }
}
