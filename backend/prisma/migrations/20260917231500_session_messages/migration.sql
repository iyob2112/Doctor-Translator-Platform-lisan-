-- CreateTable
CREATE TABLE IF NOT EXISTS "session_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "session_messages_session_id_created_at_idx" ON "session_messages"("session_id", "created_at");

ALTER TABLE "session_messages" DROP CONSTRAINT IF EXISTS "session_messages_session_id_fkey";
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_messages" DROP CONSTRAINT IF EXISTS "session_messages_sender_id_fkey";
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
