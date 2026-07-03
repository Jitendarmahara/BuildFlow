import { Glob } from "bun";
//find the 
const TEMPLATE_DIR = new URL("./template", import.meta.url).pathname;

export async function loadTemplateFiles(): Promise<Record<string, string>> {
  const glob = new Glob("**/*");
  const files: Record<string, string> = {};
  for await (const path of glob.scan({ cwd: TEMPLATE_DIR })) {
    files[path] = await Bun.file(`${TEMPLATE_DIR}/${path}`).text();
  }
  return files;
}
