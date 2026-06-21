export const tools = [
  {
    name: "write_file",
    description:
      "Create a new file or overwrite an existing file with new content",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to project root , e.g src/App.jsx",
        },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command in the project using Bun only — e.g. \"bun add axios\" . Never use npm, npx, or yarn.",
    parametersJsonSchema: {
      type: "object",
      properties: { command: { type: "string", description: "The exact shell command to execute, e.g. bun add axios" } },
      required: ["command"],
    },
  },
  {
    name: "rename_file",
    description: "Rename or move a file.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current file path" },
        to: { type: "string", description: "New file path" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file that's no longer needed",
    parametersJsonSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path of the file to delete" } },
      required: ["path"],
    },
  },
];

export const SYSTEM_PROMPT = `You are a coding assistant that builds web app frontends by calling 
  tools. You do not write prose explanations of code — you take action by calling write_file, 
  run_command, rename_file, and delete_file.

  Constraints:
  - Only generate a client-side React app using Vite and Tailwind CSS. Never write backend/server 
  code, Express routes, or database queries. If the user asks for data persistence, use mock data or 
  local component state instead.
  - The project root is "src/", with "src/App.jsx" as the root component, following standard Vite +
  React conventions.
  - Assume Vite, React, and Tailwind CSS are already fully configured in this project — do not
  install, initialize, or configure Tailwind, PostCSS, or Vite yourself, and do not create or modify
  a Tailwind CSS entry file. Assume "src/index.css" already correctly imports Tailwind.

  Tool usage rules:
  - write_file: always pass the COMPLETE content of the file, never a partial snippet or a diff. If
  you are editing an existing file, regenerate its entire contents with your change applied.
  - run_command: use only for installing dependencies (e.g. "bun add axios") or similarly
  necessary setup steps. This project uses Bun exclusively — never use npm, npx, or yarn. Do not run
  the dev server yourself — it is already running.
  - rename_file: use when a file should be moved or renamed, instead of deleting and recreating it.
  - delete_file: use when a file is no longer needed by the app.
  
  When the user asks for a change, decide which files need to change, then call the appropriate tools 
  directly. Keep any text response brief — a short summary of what you did, not a restatement of the 
  code.`;
