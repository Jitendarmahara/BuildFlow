import { Router } from "express";
import { client } from "@repo/db/client";
import Jwt from "jsonwebtoken";
import { z } from "zod";
import { loadTemplateFiles } from "../template";
import { Awsclient } from "@repo/storage/Awsclient";
import { bootpod, killproject } from "../orchestrator";
import { Middleware } from "../auth/auth";
import { JWT_SECRET } from "../config";

const router = Router();

// load the template files once at boot
const filecontent = await loadTemplateFiles();

// Caddy on-demand TLS "ask" hook. Before Caddy issues a cert for an SNI it GETs this with
// ?domain=<host>; a 2xx means "mint it". We only allow our own hostnames so a stranger pointing
// their domain at our LoadBalancer can't make us burn Let's Encrypt quota on their behalf.
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN ?? "";
router.get("/internal/allow-tls", (req, res) => {
  const host = String(req.query.domain ?? "");
  const ok =
    !!PUBLIC_DOMAIN &&
    (host === `app.${PUBLIC_DOMAIN}` ||
      host === `api.${PUBLIC_DOMAIN}` ||
      host === `ws.${PUBLIC_DOMAIN}` ||
      host.endsWith(`.preview.${PUBLIC_DOMAIN}`));
  return res.sendStatus(ok ? 200 : 403);
});

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const signinSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const projectSchema = z.object({
  prompt: z.string().min(1),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }
  const { email, password } = parsed.data;

  const existing = await client.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: "user already exists" });
  }

  const hashed = await Bun.password.hash(password);
  const user = await client.user.create({
    data: { email, password: hashed },
  });

  const token = Jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return res.status(200).json({ token });
});

router.post("/signin", async (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }
  const { email, password } = parsed.data;

  const user = await client.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(400).json({ error: "invalid email or password" });
  }

  const ok = await Bun.password.verify(password, user.password);
  if (!ok) {
    return res.status(400).json({ error: "invalid email or password" });
  }

  const token = Jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return res.status(200).json({ token });
});

// push the template to S3, create the project + first conversation, boot the pod
router.post("/projects", Middleware, async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }
  const { prompt } = parsed.data;
  const title = prompt.slice(0, 50);

  // create the project (provisioning) + first conversation atomically
  const project = await client.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { title, userId: req.userId!, status: "provisioning" },
    });
    await tx.message.create({
      data: { projectId: project.id, content: prompt, kind:"user" },
    });
    return project;
  });

 
  try {
    for (const [path, content] of Object.entries(filecontent)) {
      const s3Key = `project/${project.id}/${path}`;
      await Awsclient.write(s3Key, content);
      await client.file.create({ data: { path, s3Key, projectId: project.id } });
    }
    await bootpod(project.id);
    await client.project.update({
      where: { id: project.id },
      data: { status: "running" },
    });
  } catch (e) {
    console.error("project provisioning failed", e);
    await client.project
      .update({ where: { id: project.id }, data: { status: "failed" } })
      .catch(() => {});
    return res.status(500).json({ error: "failed to provision project" });
  }

  return res.status(200).json({ projectId: project.id });
});

// get the all the conversation of  the signed user

router.get("/projects" , Middleware , async(req , res)=>{
  const userId = req.userId;
  const projects = await client.project.findMany({
    where:{
      userId
    },
    orderBy:{updatedAt:"desc"},
    select:{id:true , title:true , status:true , createdAt:true , updatedAt:true}
  });
  res.json({projects})
})

router.get("/projects/:id/messages" , Middleware, async(req , res)=>{
  const {id} = req.params;
  if(typeof(id)!== 'string'){
    return res.status(400).json({
      error:"id need to be a string"
    })
  }
  const owns = await client.project.findFirst({
    where:{
      id , userId:req.userId
    },
    select:{
      id:true
    }
  })
  if(!owns){
    return res.status(404).json({error:"project not found"})
  }
  const message = await client.message.findMany({
    where :{
      projectId: id
    },
    orderBy:{createdAt :"asc"},
    select:{id:true , kind:true , content:true , toolName:true , args:true , path:true , createdAt : true}
  })
  res.json({message})
})

router.post("/projects/:id/open" , Middleware , async(req , res)=>{
  const {id}= req.params;
  if(typeof(id)!== "string"){
    return  res.status(400).json({
      error:"id need to be a string"
    })
  }
  const owns = await client.project.findFirst({
    where:{id , userId: req.userId},
    select:{id:true}
  })
  if(!owns){
    return res.status(404).json({error:"project not found"})
  }
  try{
    await bootpod(id);
    await client.project.update({
      where:{
        id
      },
      data:{
        status:"running" , lastActiveAt: new Date()
      }
    });
    res.json({ok:true , projectId: id})
  }catch(e){
    console.log("failed to open the project");
    return res.status(500).json({error:"falied to open project"})
  }
})

// Delete a project for good: tear down its k8s resources, wipe its S3 objects, then remove the DB
// row (its messages + file rows cascade via the schema's onDelete: Cascade). k8s + S3 cleanup are
// best-effort so a project that's sleeping, archived, or half-provisioned can still be deleted.
router.delete("/projects/:id", Middleware, async (req, res) => {
  const { id } = req.params;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "id need to be a string" });
  }
  const owns = await client.project.findFirst({
    where: { id, userId: req.userId },
    select: { id: true },
  });
  if (!owns) {
    return res.status(404).json({ error: "project not found" });
  }

  // 1) tear down any live k8s resources (orchestrator treats a 404 as success)
  try {
    await killproject(id);
  } catch (e) {
    console.error(`delete: killproject failed for ${id}`, e);
  }

  // 2) wipe every S3 object under project/<id>/ (template files + anything the agent wrote)
  try {
    const prefix = `project/${id}/`;
    let token: string | undefined = undefined;
    do {
      const page: any = await Awsclient.list({ prefix, maxKeys: 1000, continuationToken: token });
      const keys: string[] = (page?.contents ?? []).map((o: any) => o?.key).filter(Boolean);
      await Promise.allSettled(keys.map((k: string) => Awsclient.delete(k)));
      token = page?.isTruncated ? page?.nextContinuationToken : undefined;
    } while (token);
  } catch (e) {
    console.error(`delete: S3 cleanup failed for ${id}`, e);
  }

  // 3) remove the DB project (messages + files cascade)
  await client.project.delete({ where: { id } });

  return res.json({ ok: true });
});

export default router;
