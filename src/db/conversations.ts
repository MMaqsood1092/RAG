import { v4 as uuid } from "uuid";
import { pool } from "./client";
import { withRetry } from "./retry";

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
}

export async function createConversation(): Promise<string> {
  const id = uuid();
  await withRetry(
    () => pool.query("INSERT INTO conversations (id) VALUES ($1)", [id]),
    3,
    "Create conversation"
  );
  return id;
}

export async function getRecentMessages(
  conversationId: string,
  limit: number = 20
): Promise<Message[]> {
  const { rows } = await withRetry(
    () =>
      pool.query<Message>(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [conversationId, limit]
      ),
    3,
    "Get messages"
  );
  return rows;
}

export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<void> {
  const id = uuid();
  await withRetry(
    () =>
      pool.query(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES ($1, $2, $3, $4)`,
        [id, conversationId, role, content]
      ),
    3,
    "Save message"
  );
}

export async function touchConversation(conversationId: string): Promise<void> {
  await withRetry(
    () =>
      pool.query(
        "UPDATE conversations SET updated_at = now() WHERE id = $1",
        [conversationId]
      ),
    3,
    "Touch conversation"
  );
}
