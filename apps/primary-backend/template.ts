import { Glob } from "bun";
//find the template folder and the work is simple  it sotre the filename with the content of its in a map form so we can push it to the s3 store;
const TEMPLATE_DIR = new URL("./template", import.meta.url).pathname;

export async function loadTemplateFiles(): Promise<Record<string, string>> {
  const glob = new Glob("**/*");
  const files: Record<string, string> = {};
  for await (const path of glob.scan({ cwd: TEMPLATE_DIR })) {
    files[path] = await Bun.file(`${TEMPLATE_DIR}/${path}`).text();// this get the text of the file 
  }
  return files;

}
