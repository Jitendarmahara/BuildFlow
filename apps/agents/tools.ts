import OpenAI from "openai";
import { $ } from "bun";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sidecar } from "./sidecar";
import { WORKSPACE_DIR } from "./config";

const SKIP = new Set(["node_modules", ".git", "dist"]);

// recursive file list that never descends into node_modules (fast)
async function walk(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

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
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List all source files in the project (excludes node_modules, dist, .git). Use this at the start of a follow-up change to see what exists before reading or editing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file's complete current contents, relative to the project root (e.g. 'src/App.jsx'). Always read a file before editing it, so your write_file regenerates the correct full content instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "path relative to project root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_subagents",
      description:
        "Delegate independent, FILE-DISJOINT subtasks to parallel sub-agents. Only use when subtasks touch different files (e.g. one builds src/lib/store.js, another builds src/components/FilterBar.jsx) — never two on the same file. Each runs in isolation and is merged back.",
      parameters: {
        type: "object",
        properties: {
          subtasks: {
            type: "array",
            description: "the disjoint subtasks to run in parallel",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "short id, e.g. 's1'" },
                description: {
                  type: "string",
                  description: "what to build + which files it owns",
                },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["subtasks"],
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
      await sidecar.writeFile(args.path, args.content , WORKSPACE_DIR);
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
    case "list_files":
      return { ok: true, files: await walk(workspaceDir) };
    case "read_file": {
      const base = resolve(workspaceDir);
      const full = resolve(workspaceDir, args.path);
      if (full !== base && !full.startsWith(base + "/"))
        return { ok: false, error: "path escapes the project" };
      const file = Bun.file(full);
      if (!(await file.exists())) return { ok: false, error: `not found: ${args.path}` };
      return { ok: true, content: await file.text() };
    }
    case "create_plan":
      return {ok:true , taskCount: args.tasks?.length ?? 0};
    case "update_task_status":
      return {ok:true , taskId : args.taskId , status : args.status};
    default:
      return { success: false, error: `unknown tool: ${name}` };
  }
}
