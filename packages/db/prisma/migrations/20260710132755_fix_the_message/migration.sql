/*
  Warnings:

  - You are about to drop the `Conversation` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('user', 'assistant', 'tool_call', 'tool_result');

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_userId_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "status" SET DEFAULT 'provisioning';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "Conversation";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "toolCallId" TEXT,
    "content" TEXT,
    "toolName" TEXT,
    "path" TEXT,
    "args" JSONB,
    "result" JSONB,
    "commitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
