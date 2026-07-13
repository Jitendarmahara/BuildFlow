import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
export {MessageKind} from "./generated/prisma/client"

// 1. Tell TypeScript the global may hold our client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 2. Reuse the existing client if it's already there; otherwise make one
export const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

// 3. In dev, park it on global so the next hot-reload reuses it.
//    In production, skip this — production starts once, no reloads.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

