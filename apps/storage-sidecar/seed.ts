import { client } from "@repo/db/client";

const PROJECT_ID = "local-test";

const user = await client.user.upsert({
  where: { email: "local@test.dev" },
  update: {},
  create: { email: "local@test.dev", password: "local" },
});

await client.project.upsert({
  where: { id: PROJECT_ID },
  update: { status: "running" },
  create: { id: PROJECT_ID, title: "local test", userId: user.id, status: "running" },
});

// seed the prompt only once, so re-running this script doesn't stack extra turns
const existing = await client.message.findFirst({ where: { projectId: PROJECT_ID } });
if (!existing) {
  await client.message.create({
    data: {
      projectId: PROJECT_ID,
      kind: "user",
      content: "build me a todo app with due dates and filters",
    },
  });
}

console.log("seeded", PROJECT_ID);
process.exit(0);
