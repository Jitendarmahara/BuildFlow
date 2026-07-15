import OpenAI from "openai";
import { $ } from "bun";
import { sidecar } from "./sidecar";

export const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with its COMPLETE content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "path relative to project root, e.g. src/App.jsx" },
          content: { type: "string", description: "the full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the project (e.g. 'bun add axios'). Bun only — never npm/npx/yarn.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "the exact command" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file.",
      parameters: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file that is no longer needed.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
];
export async function executeTool(
  name: string,
  args: any,
  workspaceDir: string,
): Promise<any> {
  switch (name) {
    case "write_file":
      await sidecar.writeFile(args.path, args.content);
      return { success: true };
    case "rename_file":
      await sidecar.renameFile(args.from, args.to);
      return { success: true };
    case "delete_file":
      await sidecar.deleteFile(args.path);
      return { success: true };
    case "run_command": {
      const out = await $`sh -c ${args.command}`.cwd(workspaceDir).nothrow().text();
      return { success: true, output: out };
    }
    default:
      return { success: false, error: `unknown tool: ${name}` };
  }
}