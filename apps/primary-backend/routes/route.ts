import { Router } from "express";
import { client } from "@repo/db/client";
import Jwt from "jsonwebtoken";
import { z } from "zod";
import { loadTemplateFiles } from "../template";
import { Awsclient } from "@repo/storage/Awsclient";
import { bootpod } from "../orchestrator";
import { Middleware } from "../auth/auth";

const router = Router();

// load the template files once at boot
const filecontent = await loadTemplateFiles();

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

  const token = Jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
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

  const token = Jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
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
    await tx.conversation.create({
      data: { projectId: project.id, content: prompt, role: "user" },
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

export default router;
