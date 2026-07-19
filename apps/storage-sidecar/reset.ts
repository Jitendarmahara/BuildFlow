import { client } from "@repo/db/client";

const PROJECT_ID = "local-test";

// wipe the whole conversation and leave only the fresh user prompt, so the
// agent's next boot sees an unanswered turn and regenerates from scratch
await client.message.deleteMany({ where: { projectId: PROJECT_ID } });
await client.message.create({
  data: {
    projectId: PROJECT_ID,
    kind: "user",
    content: "build me a todo app with due dates and filters",
  },
});

console.log("reset conversation for", PROJECT_ID);
process.exit(0);
