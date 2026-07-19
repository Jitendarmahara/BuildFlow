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
          path: {
            type: "string",
            description: "path relative to project root, e.g. src/App.jsx",
          },
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
      description:
        "Run a shell command in the project (e.g. 'bun add axios'). Bun only — never npm/npx/yarn.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "the exact command" },
        },
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
  {
    type: "function",
    function: {
      name: "create_plan",
      description:
        "Break the user's request into an ordered list of subtasks BEFORE writing any code. Call this once at the start of a turn.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "the subtasks, in the order you will do them",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "a short stable id, e.g. 't1'",
                },
                description: {
                  type: "string",
                  description: "what this subtask does",
                },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description:
        "Update a subtask's status. Call with 'in_progress' when you start it and 'done' when you finish it.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "the id from create_plan" },
          status: { type: "string", enum: ["pending", "in_progress", "done"] },
        },
        required: ["taskId", "status"],
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
      const out = await $`sh -c ${args.command}`
        .cwd(workspaceDir)
        .nothrow()
        .text();
      return { success: true, output: out };
    }
    case "create_plan":
      return {ok:true , taskCount: args.tasks?.length ?? 0};
    case "update_task_status":
      return {ok:true , taskId : args.taskId , status : args.status};
    default:
      return { success: false, error: `unknown tool: ${name}` };
  }
}
