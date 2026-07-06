import type { Request, Response } from "express";
import { resolveInWorkspace } from "./workspace";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "path";

export async function write_file(req: Request, res: Response) {
  const { path, content } = req.body;
  if (typeof path !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "path and content must be strings" });
  }
  let target: { abs: string; rel: string };
  try {
    target = resolveInWorkspace(path); // checking if the path is correct or not ;
  } catch (e) {
    return res.status(400).json({ error: "invalid path" });
  }
  // write to the pvc
  try {
    await Bun.write(target.abs, content); // this shoudl write to pvc
    return res.json({ ok: true, path: target.rel });
  } catch (e) {
    console.error("write_file failed", e);
    return res.status(500).json({ error: "write_failed" });
  }
}

export async function rename_file(req: Request, res: Response) {
  const { from, to } = req.body;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({
      error: "form or to must be string",
    });
  }
  let src: { abs: string; rel: string };
  let dst: { abs: string; rel: string };
  try {
    src = resolveInWorkspace(from);
    dst = resolveInWorkspace(to);
  } catch (e) {
    return res.status(400).json({ error: "invalid path" });
  }
  // try updating the fiels in all the places;
  try {
    // check if the dir exits or not ;
    await mkdir(dirname(dst.abs), { recursive: true });
    await rename(src.abs, dst.abs);
    return res.json({ ok: true, from: src.rel, to: dst.rel });
  } catch (e) {
    console.error("rename_file failed", e);
    return res.status(500).json({ error: "rename failed" });
  }
}
export async function delete_file(req: Request, res: Response) {
  const { path } = req.body;
  if (typeof path !== "string") {
    return res.status(400).json({ error: "path must be a string" });
  }

  let target: { abs: string; rel: string };
  try {
    target = resolveInWorkspace(path);
  } catch {
    return res.status(400).json({ error: "invalid path" });
  }

  try {
    await unlink(target.abs).catch(() => {}); // PVC — ignore if already gone
    return res.json({ ok: true, path: target.rel });
  } catch (e) {
    console.error("delete_file failed", e);
    return res.status(500).json({ error: "delete failed" });
  }
}
