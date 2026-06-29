import { pool } from "../db/client";
import { config } from "../config";
import { huggingfaceService } from "../services/huggingface";
import { generateChatResponseHF } from "../services/chat-hf";
import { mockHuggingfaceService } from "../services/huggingface-mock";
import {
  createConversation,
  getRecentMessages,
  saveMessage,
  touchConversation,
  type Message,
} from "../db/conversations";
import {
  getEventsByTitleContext,
  listEventsWithTitlesContext,
  listEventsWithAllDetailsContext,
  getSchemaDescription,
  getOneProjectAttachmentsWithDetails,
  getProjectWithAttachmentsById,
  getAllAttachmentsWithContentSummary,
  getAttachmentContextByFilename,
} from "../db/linked_data";

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

type EmbedProvider = "voyage" | "huggingface";

async function embedQuery(
  text: string,
  provider: EmbedProvider = "voyage",
  modelId?: string
): Promise<number[]> {
  if (provider === "huggingface") {
    const embeddings = await huggingfaceService.embed(
      [text],
      modelId || "sentence-transformers/all-mpnet-base-v2"
    );
    return embeddings[0];
  }

  // Default to Voyage
  const response = await fetch(`${VOYAGE_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.voyageKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-3-lite",
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

const SYSTEM_PROMPT = `You are a helpful assistant. You have three sources of information:
1. **Conversation history** – what you and the user already said in this chat.
2. **Context from knowledge base** – retrieved passages for the current turn.
3. **Events and linked projects** – when provided, each event is linked to a project; when answering about a specific event title, prefer the structured event+project information over loose text.

**Follow-up questions:** When the user asks for "more", "others", "expand on that", "what else", or similar, they are referring to the previous topic. Use your previous answer AND the new context to list more items, give more examples, or go deeper. Do not say you cannot answer just because the current context snippet is different – combine conversation history with any new context.

**Always:** Prefer answering from the knowledge base when possible; for follow-ups, also use what you already said. If the user changes topic, use the new topic. If something is not in context or history, say so.`;

export interface ChatResult {
  answer: string;
  conversationId: string;
}

interface SqlToolResult {
  is_sql_query: boolean;
  sql?: string;
  reason?: string;
}

/**
 * Try to answer a structured SQL question using HuggingFace text generation,
 * executing it against the Postgres database, and returning the rows.
 * Returns null when the question is not suitable for SQL, so the caller
 * can fall back to regular RAG.
 */
async function tryAnswerWithSql(question: string): Promise<string | null> {
  const schema = await getSchemaDescription();

  const sqlPrompt = `You are a SQL expert. Decide if the user's question can be answered using ONLY the given SQL schema. 
If yes, generate a single safe SELECT (or WITH ... SELECT) query against that schema. 
For questions about project attachments, use the project_attachment_details view.
NEVER modify data (no INSERT/UPDATE/DELETE/DDL). 

Respond ONLY with a JSON object (no other text):
{
  "is_sql_query": boolean,
  "sql": "SELECT ...",
  "reason": "optional explanation"
}`;

  const userPrompt = `Schema:\n${schema}\n\nUser question: ${question}`;

  let response: string;

  try {
    response = await generateChatResponseHF(
      sqlPrompt,
      userPrompt,
      "",
      "mistralai/Mistral-7B-Instruct-v0.1",
      { maxTokens: 500 }
    );
  } catch (err) {
    console.error("SQL generation failed with external API, trying mock:", err);
    try {
      response = await mockHuggingfaceService.generateText(
        `${sqlPrompt}\n\n${userPrompt}`,
        "mistralai/Mistral-7B-Instruct-v0.1",
        { maxTokens: 500 }
      );
    } catch (mockErr) {
      console.error("Mock SQL generation also failed:", mockErr);
      return null;
    }
  }

  let parsed: SqlToolResult;
  try {
    // Extract JSON from response (might have surrounding text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : "{}";
    parsed = JSON.parse(jsonStr) as SqlToolResult;
  } catch {
    return null;
  }

  if (!parsed.is_sql_query || !parsed.sql) {
    return null;
  }

  let sql = parsed.sql.trim();
  const upper = sql.toUpperCase();

  // Basic safety checks: only allow SELECT / WITH
  if (!(upper.startsWith("SELECT ") || upper.startsWith("WITH "))) {
    return null;
  }
  if (sql.split(";").length > 2) {
    return null;
  }

  // Rewrite events references if events_raw exists
  try {
    const { rows: rawTables } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const hasEventsRaw = rawTables.some(
      (r) => r.table_name.toLowerCase() === "events_raw"
    );
    if (hasEventsRaw && /\bevents\b/i.test(sql) && !/\bevents_raw\b/i.test(sql)) {
      sql = sql.replace(/\bevents\b/gi, "events_raw");
    }
  } catch {
    // Ignore
  }

  const { rows: rawRows } = await pool.query<Record<string, unknown>>(sql);
  if (rawRows.length === 0) {
    return "The query ran successfully but returned no rows.";
  }

  // Deduplicate
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const row of rawRows) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }

  const wantsAll = /\ball\b/i.test(question);
  const maxRows = wantsAll ? rows.length : Math.min(rows.length, 50);

  const forbiddenColumns = new Set(["content", "merged_cells", "column_widths"]);
  const columns = Object.keys(rows[0]).filter((c) => !forbiddenColumns.has(c));

  const lines: string[] = [];
  lines.push(`Here are ${maxRows} row(s) from the database:`);

  for (let i = 0; i < maxRows; i += 1) {
    const row = rows[i];
    const kv = columns
      .map((c) => {
        const v = (row as any)[c];
        if (v === null || v === undefined) return `${c}=null`;
        if (v instanceof Date) return `${c}=${v.toISOString()}`;
        return `${c}=${String(v).trim()}`;
      })
      .join(", ");
    lines.push(`${i + 1}. ${kv}`);
  }

  if (!wantsAll && rows.length > maxRows) {
    const remaining = rows.length - maxRows;
    lines.push(
      `There are ${remaining} more row(s) not shown. Ask to see more if needed.`
    );
  }

  return lines.join("\n");
}

/** Turn a short follow-up like "more failures" into a standalone query using HuggingFace. */
async function expandQueryForSearch(
  question: string,
  history: Message[]
): Promise<string> {
  if (question.length > 80 || history.length < 2) return question;

  const lastUser = history.filter((m) => m.role === "user").pop()?.content ?? "";
  const lastAssistant = history.filter((m) => m.role === "assistant").pop()?.content ?? "";
  const summary = lastAssistant.slice(0, 400);

  try {
    const response = await generateChatResponseHF(
      "Rewrite the follow-up as a single, standalone search query. Reply with only the query, no explanation.",
      `Previous question: ${lastUser}\nPrevious answer: ${summary}\nFollow-up: ${question}\nStandalone query:`,
      "",
      "mistralai/Mistral-7B-Instruct-v0.1",
      { maxTokens: 100 }
    );

    const expanded = response.trim();
    return expanded && expanded.length > 0 ? expanded : question;
  } catch {
    return question;
  }
}

export async function chat(
  question: string,
  conversationId?: string | null
): Promise<ChatResult> {
  let cid = conversationId;

  if (!cid) {
    cid = await createConversation();
  }

  const history = await getRecentMessages(cid, 20);
  const searchQuery = await expandQueryForSearch(question, history);

  // UUID pattern for project ID matching
  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

  // Check for project ID + attachments
  const projectIdMatch =
    question.match(new RegExp(`\\bproject\\b[\\s\\S]*?\\bid\\s*[:=]\\s*(${uuidPattern})`, "i")) ||
    question.match(new RegExp(`\\bproject\\b\\s+(?:with\\s+)?(?:id\\s*[:=]\\s*)?(${uuidPattern})`, "i")) ||
    question.match(new RegExp(`\\bproject\\b[\\s\\S]*?\\b(${uuidPattern})\\b[\\s\\S]*?\\battachment`, "i"));

  const wantsProjectWithIdAndAttachments = projectIdMatch && /\battachment(s)?\b/i.test(question);
  if (wantsProjectWithIdAndAttachments && projectIdMatch) {
    const projectId = projectIdMatch[1];
    const projectAnswer = await getProjectWithAttachmentsById(projectId);
    if (projectAnswer) {
      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", projectAnswer);
      await touchConversation(cid);
      return { answer: projectAnswer, conversationId: cid };
    }
  }

  // Follow-up: more details of project
  const wantsMoreDetailsOfProject =
    /\b(detail|details|more)\b/i.test(question) &&
    !new RegExp(uuidPattern, "i").test(question);
  if (wantsMoreDetailsOfProject) {
    let projectIdFromHistory: string | null = null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (!/\bproject\b/i.test(history[i].content)) continue;
      const match = history[i].content.match(new RegExp(uuidPattern, "i"));
      if (match) {
        projectIdFromHistory = match[0];
        break;
      }
    }
    if (projectIdFromHistory) {
      const projectAnswer = await getProjectWithAttachmentsById(projectIdFromHistory);
      if (projectAnswer) {
        await saveMessage(cid, "user", question);
        await saveMessage(cid, "assistant", projectAnswer);
        await touchConversation(cid);
        return { answer: projectAnswer, conversationId: cid };
      }
    }
  }

  // Check all attachments
  const wantsAllAttachmentsWithContent =
    /\b(?:check|list|show|get)\s+(?:all\s+)?(?:the\s+)?attachment(s)?\b/i.test(question) &&
    /\b(?:tell\s+me\s+)?what\s+each\b/i.test(question);
  if (wantsAllAttachmentsWithContent) {
    const allSummary = await getAllAttachmentsWithContentSummary();
    if (allSummary) {
      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", allSummary);
      await touchConversation(cid);
      return { answer: allSummary, conversationId: cid };
    }
  }

  // Project attachments
  const wantsProjectAttachments =
    /\bproject(s)?\b/i.test(question) && /\battachment(s)?\b/i.test(question);
  if (wantsProjectAttachments) {
    const attachmentAnswer = await getOneProjectAttachmentsWithDetails();
    if (attachmentAnswer) {
      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", attachmentAnswer);
      await touchConversation(cid);
      return { answer: attachmentAnswer, conversationId: cid };
    }
  }

  // Attachment by filename
  const attachmentInfoMatch =
    question.match(/information\s+(?:that\s+)?(?:this\s+)?attachment\s+has\s*[:\s]+([^\s?]+?)(?:\s*\?)?$/im) ||
    question.match(/information\s+of\s+(?:the\s+)?attachment\s*[:\s]+([^\s?]+?)(?:\s*\?)?$/im) ||
    question.match(/attachment_name\s*=\s*([^,?]+?)(?:\s*\?)?$/im) ||
    question.match(/attachment\s+with\s+attachment_name\s*=\s*([^,?]+?)(?:\s*\?)?$/im) ||
    question.match(/\battachment\s+([\w\-]+\.(?:pptx?|pdf|docx?|xlsx?|txt|csv|eml))/i) ||
    question.match(/\b(?:content of|what (?:content )?does)\s+(?:the\s+)?attachment\s+([\w\-]+\.(?:pptx?|pdf|docx?|xlsx?|txt|csv|eml))/i);

  const explicitFilenameRaw = attachmentInfoMatch ? attachmentInfoMatch[1].trim().replace(/\?+$/, "") : null;
  const explicitFilename =
    explicitFilenameRaw && explicitFilenameRaw.toLowerCase() !== "null" ? explicitFilenameRaw : null;

  const attachmentWithFile =
    explicitFilename ||
    (/\b(?:attachment|file|document|read)\b/i.test(question) &&
      (() => {
        const m = question.match(/[\w.\-\s]+\.(?:pptx?|pdf|docx?|xlsx?|txt|csv|eml)/i);
        return m ? m[0].trim() : null;
      })());

  let effectiveAttachment = attachmentWithFile;
  if (!effectiveAttachment) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const m = history[i].content.match(/[\w.\-\s]+\.(?:pptx?|pdf|docx?|xlsx?|txt|csv|eml)/i);
      if (m) {
        effectiveAttachment = m[0].trim();
        break;
      }
    }
  }

  if (effectiveAttachment) {
    const context = await getAttachmentContextByFilename(effectiveAttachment);
    if (context) {
      const truncated =
        context.length > 14000 ? context.slice(0, 14000) + "\n\n[... truncated ...]" : context;

      try {
        const answer = await generateChatResponseHF(
          "Answer the user's question using only the provided context about an attachment. Be concise and direct.",
          question,
          truncated,
          "mistralai/Mistral-7B-Instruct-v0.1",
          { maxTokens: 1000 }
        );

        await saveMessage(cid, "user", question);
        await saveMessage(cid, "assistant", answer);
        await touchConversation(cid);
        return { answer, conversationId: cid };
      } catch (err) {
        console.error("Attachment QA failed, trying mock:", err);
        try {
          const mockAnswer = await mockHuggingfaceService.generateText(
            `Context:\n${truncated}\n\nQuestion: ${question}`,
            "mistralai/Mistral-7B-Instruct-v0.1",
            { maxTokens: 1000 }
          );
          await saveMessage(cid, "user", question);
          await saveMessage(cid, "assistant", mockAnswer);
          await touchConversation(cid);
          return { answer: mockAnswer, conversationId: cid };
        } catch (mockErr) {
          console.error("Mock attachment QA also failed:", mockErr);
          const fallback = context.slice(0, 500);
          await saveMessage(cid, "user", question);
          await saveMessage(cid, "assistant", fallback);
          await touchConversation(cid);
          return { answer: fallback, conversationId: cid };
        }
      }
    }

    const attachmentNotFoundMessage =
      `No attachment found for "${attachmentWithFile}".\n\n` +
      `• Try by display name or path filename.\n` +
      `• For extracted content, run: npm run ingest:attachments`;
    await saveMessage(cid, "user", question);
    await saveMessage(cid, "assistant", attachmentNotFoundMessage);
    await touchConversation(cid);
    return { answer: attachmentNotFoundMessage, conversationId: cid };
  }

  // Try SQL path
  try {
    const sqlAnswer = await tryAnswerWithSql(question);
    if (sqlAnswer) {
      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", sqlAnswer);
      await touchConversation(cid);
      return { answer: sqlAnswer, conversationId: cid };
    }
  } catch (err) {
    console.error("SQL path failed:", err);
  }

  // List events
  const listMatch = question.match(/list\s+(\d+)\s+events?/i);
  if (listMatch) {
    const n = parseInt(listMatch[1], 10) || 10;
    const wantsDetails = /detail(s)?/i.test(question);
    const answer = wantsDetails
      ? await listEventsWithAllDetailsContext(n)
      : await listEventsWithTitlesContext(n);

    await saveMessage(cid, "user", question);
    await saveMessage(cid, "assistant", answer);
    await touchConversation(cid);
    return { answer, conversationId: cid };
  }

  // Main RAG flow with vector search
  let embedding: number[];
  try {
    embedding = await embedQuery(searchQuery, "voyage");
  } catch (err) {
    console.error("Voyage embedding failed, trying HuggingFace:", err);
    try {
      embedding = await embedQuery(searchQuery, "huggingface");
    } catch (hfErr) {
      console.error("Both embedders failed, using mock:", hfErr);
      embedding = (await mockHuggingfaceService.embed([searchQuery]))[0];
    }
  }

  const embeddingVector = `[${embedding.join(",")}]`;
  const { rows } = await pool.query<{ content: string }>(
    `SELECT content FROM chunks ORDER BY embedding <=> $1::vector LIMIT 5`,
    [embeddingVector]
  );

  const ragContext = rows.map((r) => r.content).join("\n\n");

  // Check for event title inference
  const match = question.match(/title\s+is\s+(.+)/i);
  const inferredTitle = match?.[1]?.trim().replace(/[?.!"]+$/g, "") ?? "";
  const linkedContext = inferredTitle ? await getEventsByTitleContext(inferredTitle) : "";

  const fullContext = [linkedContext, ragContext].filter(Boolean).join("\n\n---\n\n");

  try {
    const answer = await generateChatResponseHF(
      SYSTEM_PROMPT,
      fullContext ? `Context:\n${fullContext}\n\nQuestion: ${question}` : question,
      "",
      "mistralai/Mistral-7B-Instruct-v0.1",
      { maxTokens: 1024 }
    );

    await saveMessage(cid, "user", question);
    await saveMessage(cid, "assistant", answer);
    await touchConversation(cid);
    return { answer, conversationId: cid };
  } catch (err) {
    console.error("Chat failed with external API, using mock fallback:", err);

    // Fallback to mock service when external APIs unavailable
    try {
      const mockAnswer = await mockHuggingfaceService.generateText(
        fullContext ? `You are a helpful assistant with access to leads data.\n\nContext:\n${fullContext}\n\nUser question: ${question}` : `You are a helpful assistant. User question: ${question}`,
        "mistralai/Mistral-7B-Instruct-v0.1",
        { maxTokens: 1024 }
      );

      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", mockAnswer);
      await touchConversation(cid);
      return { answer: mockAnswer, conversationId: cid };
    } catch (mockErr) {
      console.error("Mock fallback also failed:", mockErr);
      const fallback = "I encountered an error processing your question. Please try again.";
      await saveMessage(cid, "user", question);
      await saveMessage(cid, "assistant", fallback);
      await touchConversation(cid);
      return { answer: fallback, conversationId: cid };
    }
  }
}
