import { pool } from "./client";

export interface ProjectRow {
  id: string;
  name: string | null;
  description: string | null;
}

export interface EventWithProjectRow {
  event_id: string;
  event_name: string | null;
  event_details: string | null;
  event_created_at: Date;
  project_id: string;
  project_name: string | null;
  project_description: string | null;
}

/**
 * Return a compact description of the public schema (tables and columns).
 * This is used as schema context for text-to-SQL.
 */
export async function getSchemaDescription(): Promise<string> {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  );

  if (rows.length === 0) {
    return "No tables found in public schema.";
  }

  const byTable = new Map<
    string,
    { columns: { name: string; type: string }[] }
  >();

  for (const row of rows) {
    const entry =
      byTable.get(row.table_name) ??
      { columns: [] };
    entry.columns.push({
      name: row.column_name,
      type: row.data_type,
    });
    byTable.set(row.table_name, entry);
  }

  const lines: string[] = [];
  for (const [table, info] of byTable.entries()) {
    const cols = info.columns
      .map((c) => `${c.name} ${c.type}`)
      .join(", ");
    lines.push(`${table}(${cols})`);
  }

  return lines.join("\n");
}

/** One row from project_attachment_details view */
export interface ProjectAttachmentDetailRow {
  project_id: string;
  project_name: string | null;
  event_id: string;
  event_name: string | null;
  attachment_path: string | null;
  document_id: string;
  content_preview: string | null;
}

/** Max attachments to include when listing "all attachments with content". */
const MAX_ALL_ATTACHMENTS_WITH_CONTENT = 80;

/**
 * List attachments with a short content summary (what each file contains from ingested docs).
 * Caps at MAX_ALL_ATTACHMENTS_WITH_CONTENT. Use when the user asks "check all attachments and tell me what each is".
 */
export async function getAllAttachmentsWithContentSummary(
  limit: number = MAX_ALL_ATTACHMENTS_WITH_CONTENT,
): Promise<string | null> {
  try {
    const { rows: attachRows } = await pool.query<{
      id: string;
      path: string | null;
      name: string | null;
      project_id: string | null;
    }>(
      `SELECT id, path, name, project_id FROM attachments ORDER BY created_at DESC NULLS LAST LIMIT $1`,
      [limit],
    );
    if (attachRows.length === 0) {
      return "No attachments found in the database.";
    }

    const lines: string[] = [
      `Found ${attachRows.length} attachment(s). Below: name, path, and what each contains (from ingested text).`,
      "",
      "Note: Only files that exist under src/Attatchments are ingested. Many attachments in the database are registered with paths like /projects/... and may not have a copy in that folder—for those, content cannot be extracted until the file is placed there and ingest is run.",
      "",
    ];

    for (let i = 0; i < attachRows.length; i++) {
      const a = attachRows[i];
      const pathFilename =
        (a.path ?? "").split("/").filter(Boolean).pop() ??
        (a.path ?? "").split("\\").filter(Boolean).pop() ??
        "";
      lines.push(`--- ${i + 1}. ${(a.name ?? pathFilename) || "—"} ---`);
      lines.push(`Path: ${a.path ?? "—"}`);
      if (pathFilename) {
        const pathLike =
          "%" +
          pathFilename.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") +
          "%";
        const { rows: docRows } = await pool.query<{ id: string }>(
          `SELECT id FROM documents
           WHERE path LIKE $1 ESCAPE E'\\'
              OR replace(path, E'\\', '/') LIKE $1 ESCAPE E'\\'
           LIMIT 1`,
          [pathLike],
        );
        if (docRows.length > 0) {
          const { rows: chunkRows } = await pool.query<{ content: string | null }>(
            `SELECT content FROM chunks WHERE document_id = $1 ORDER BY id`,
            [docRows[0].id],
          );
          const content = chunkRows
            .map((r) => r.content ?? "")
            .filter(Boolean)
            .join("\n\n");
          if (content.trim()) {
            const preview =
              content.trim().length > 400
                ? content.trim().slice(0, 400) + "..."
                : content.trim();
            lines.push(`What it contains: ${preview}`);
          } else {
            lines.push("What it contains: (no extracted text)");
          }
        } else {
          lines.push(
            "What it contains: (file not in Attatchments folder—only files under src/Attatchments are ingested; copy the file there if you have it and run npm run ingest:attachments)",
          );
        }
      } else {
        lines.push("What it contains: —");
      }
      lines.push("");
    }

    if (attachRows.length >= limit) {
      lines.push(
        `(Showing first ${limit} attachments. Ask for a specific attachment by name for full content.)`,
      );
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * Get one project and all its attachments with content preview (from ingested docs/chunks).
 * Returns a human-readable string or null if the view is missing or returns no rows.
 */
export async function getOneProjectAttachmentsWithDetails(): Promise<string | null> {
  try {
    const { rows } = await pool.query<ProjectAttachmentDetailRow>(
      `SELECT project_id, project_name, event_id, event_name, attachment_path, document_id, content_preview
       FROM project_attachment_details
       WHERE project_id = (SELECT project_id FROM project_attachment_details LIMIT 1)
       LIMIT 100`,
    );
    if (rows.length === 0) {
      return "No project attachments were found. Make sure you have run db:init (to create the view) and ingest:attachments (to ingest files under Attatchments).";
    }

    const projectName = rows[0].project_name ?? rows[0].project_id;
    const projectId = rows[0].project_id;
    const lines: string[] = [
      `Project: ${projectName} (id: ${projectId})`,
      "",
      `Found ${rows.length} attachment(s):`,
      "",
    ];

    rows.forEach((r, i) => {
      const pathLabel = r.attachment_path ? r.attachment_path.replace(/^.*[/\\]/, "") : "—";
      lines.push(`--- Attachment ${i + 1} ---`);
      lines.push(`Event: ${r.event_id}${r.event_name ? ` (${r.event_name})` : ""}`);
      lines.push(`Path: ${r.attachment_path ?? "—"}`);
      lines.push(`File: ${pathLabel}`);
      if (r.content_preview && r.content_preview.trim()) {
        const preview = r.content_preview.trim().length > 2000
          ? r.content_preview.trim().slice(0, 2000) + "\n..."
          : r.content_preview.trim();
        lines.push(`Content / details:\n${preview}`);
      } else {
        lines.push("Content / details: (no extracted text for this attachment)");
      }
      lines.push("");
    });

    return lines.join("\n");
  } catch {
    return null;
  }
}

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Get project by id and all its attachments with optional content preview (from ingested docs).
 * Uses projects table and attachments table; for each attachment tries to find ingested content by path filename.
 */
export async function getProjectWithAttachmentsById(
  projectId: string,
): Promise<string | null> {
  const id = projectId.trim();
  if (!id || !UUID_REGEX.test(id)) return null;

  try {
    const { rows: projectRows } = await pool.query<{
      id: string;
      name: string | null;
      description: string | null;
    }>(`SELECT id, name, description FROM projects WHERE id = $1`, [id]);
    const project = projectRows[0] ?? {
      id,
      name: null as string | null,
      description: null as string | null,
    };
    const { rows: attachRows } = await pool.query<{
      id: string;
      path: string | null;
      name: string | null;
      created_at: Date | null;
    }>(
      `SELECT id, path, name, created_at FROM attachments WHERE project_id = $1 ORDER BY created_at DESC NULLS LAST`,
      [id],
    );

    if (projectRows.length === 0 && attachRows.length === 0) {
      return `No project or attachments found for id: ${id}.`;
    }

    const lines: string[] = [
      `Project: ${project.name ?? "(no name)"} (id: ${project.id})`,
      project.description ? `Description: ${project.description}` : "",
      "",
      attachRows.length === 0
        ? "This project has no attachments."
        : `Found ${attachRows.length} attachment(s):`,
      "",
    ];

    for (let i = 0; i < attachRows.length; i++) {
      const a = attachRows[i];
      const pathFilename =
        (a.path ?? "")
          .split("/")
          .filter(Boolean)
          .pop() ??
        (a.path ?? "")
          .split("\\")
          .filter(Boolean)
          .pop() ??
        "";
      lines.push(`--- Attachment ${i + 1} ---`);
      lines.push(`Name: ${(a.name ?? pathFilename) || "—"}`);
      lines.push(`Path: ${a.path ?? "—"}`);
      lines.push(`Created: ${a.created_at != null ? a.created_at : "—"}`);

      if (pathFilename) {
        const pathLike =
          "%" +
          pathFilename.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") +
          "%";
        const { rows: docRows } = await pool.query<{ id: string }>(
          `SELECT id FROM documents
           WHERE path LIKE $1 ESCAPE E'\\'
              OR replace(path, E'\\', '/') LIKE $1 ESCAPE E'\\'
           LIMIT 1`,
          [pathLike],
        );
        if (docRows.length > 0) {
          const { rows: chunkRows } = await pool.query<{ content: string | null }>(
            `SELECT content FROM chunks WHERE document_id = $1 ORDER BY id`,
            [docRows[0].id],
          );
          const content = chunkRows
            .map((r) => r.content ?? "")
            .filter(Boolean)
            .join("\n\n");
          if (content.trim()) {
            const preview =
              content.trim().length > 2000
                ? content.trim().slice(0, 2000) + "\n..."
                : content.trim();
            lines.push(`Content / details:\n${preview}`);
          } else {
            lines.push("Content / details: (no extracted text for this file)");
          }
        } else {
          lines.push(
            "Content / details: (file not in Attatchments folder—only files under src/Attatchments are ingested; copy the file there and run npm run ingest:attachments)",
          );
        }
      } else {
        lines.push("Content / details: —");
      }
      lines.push("");
    }

    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * Get extracted/content information for an attachment by filename.
 * 1) Tries to find an ingested document (path contains filename) and return chunk content.
 * 2) If not found, looks up the attachments table by name and tries document by path filename.
 * 3) If still no content, returns metadata from attachments table + a clear "content not extracted" message.
 * Returns null only if the attachment is not found in documents and not in the attachments table.
 */
export async function getAttachmentContentByFilename(
  filename: string,
): Promise<string | null> {
  const trimmed = filename.trim();
  if (!trimmed) return null;

  const likePattern =
    "%" +
    trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") +
    "%";

  try {
    // 1) Try ingested documents by display name (e.g. 75G_Soothing_Inspection_4_4_23.pptx)
    // Match using both / and \ so we find the file regardless of how path was stored.
    const { rows: docRows } = await pool.query<{ id: string; path: string | null }>(
      `SELECT id, path FROM documents
       WHERE path LIKE $1 ESCAPE E'\\\\'
          OR replace(path, E'\\\\', '/') LIKE $1 ESCAPE E'\\\\'
       LIMIT 1`,
      [likePattern],
    );
    if (docRows.length > 0) {
      const docId = docRows[0].id;
      const docPath = docRows[0].path ?? "(unknown path)";
      const { rows: chunkRows } = await pool.query<{ content: string | null }>(
        `SELECT content FROM chunks WHERE document_id = $1 ORDER BY id`,
        [docId],
      );
      const content = chunkRows
        .map((r) => r.content ?? "")
        .filter(Boolean)
        .join("\n\n");
      const header = `Attachment: ${trimmed}\nPath: ${docPath}\n\n`;
      return content.trim()
        ? header + "Extracted content / information:\n\n" + content.trim()
        : header + "No extracted content for this attachment (file may not have been ingested with text extraction, or it is unsupported).";
    }

    // 2) Look up attachments table by name or by path (so path filename like UUID.xls finds the row)
    const { rows: attachRows } = await pool.query<{
      path: string | null;
      name: string | null;
      project_id: string | null;
    }>(
      `SELECT path, name, project_id FROM attachments
       WHERE name ILIKE $1 OR (path IS NOT NULL AND position($2 in path) > 0)
       LIMIT 1`,
      ["%" + trimmed + "%", trimmed],
    );
    if (attachRows.length > 0) {
      const pathVal = attachRows[0].path ?? "";
      const pathFilename = pathVal.split("/").filter(Boolean).pop() ?? pathVal.split("\\").pop() ?? "";
      if (pathFilename) {
        const pathLike = "%" + pathFilename.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%";
        const { rows: docByPath } = await pool.query<{ id: string; path: string | null }>(
          `SELECT id, path FROM documents
           WHERE path LIKE $1 ESCAPE E'\\\\'
              OR replace(path, E'\\\\', '/') LIKE $1 ESCAPE E'\\\\'
           LIMIT 1`,
          [pathLike],
        );
        if (docByPath.length > 0) {
          const { rows: chunkRows } = await pool.query<{ content: string | null }>(
            `SELECT content FROM chunks WHERE document_id = $1 ORDER BY id`,
            [docByPath[0].id],
          );
          const content = chunkRows.map((r) => r.content ?? "").filter(Boolean).join("\n\n");
          const header = `Attachment: ${attachRows[0].name ?? trimmed}\nPath: ${pathVal}\nProject ID: ${attachRows[0].project_id ?? "—"}\n\n`;
          return content.trim()
            ? header + "Extracted content / information:\n\n" + content.trim()
            : header + "No extracted content for this attachment.\n";
        }
      }

      // 3) We have attachment metadata but no ingested content — return metadata + instructions + diagnostic
      const name = attachRows[0].name ?? trimmed;
      const pathValDisplay = pathVal || "—";
      const projectId = attachRows[0].project_id ?? "—";
      const { rows: pptxInDb } = await pool.query<{ path: string | null }>(
        `SELECT path FROM documents WHERE path ILIKE '%.pptx%' LIMIT 5`,
      );
      const pptxHint =
        pptxInDb.length === 0
          ? "No .pptx files are currently in the ingested documents. Make sure the file is inside src/Attatchments (any subfolder) when you run ingest."
          : `There are ${pptxInDb.length} .pptx file(s) already ingested (e.g. ${(pptxInDb[0].path ?? "").replace(/^.*[/\\]/, "")}). This attachment (${trimmed}) did not match—ensure the file name in the folder matches exactly, or use the path filename: ${pathFilename || "(see path above)"}.`;
      return (
        `Attachment: ${name}\n` +
        `Path: ${pathValDisplay}\n` +
        `Project ID: ${projectId}\n\n` +
        `The content of this attachment has not been extracted. The file was not found in the ingested documents.\n\n` +
        `Not all attachments in the database have files in the Attatchments folder—only files under src/Attatchments are ingested.\n\n` +
        `${pptxHint}\n\n` +
        `To get content for this file:\n` +
        `1) Copy the file into src/Attatchments (name it "${trimmed}" or "${pathFilename || "path-filename"}").\n` +
        `2) Run: npm run ingest:attachments\n` +
        `(PowerPoint, Excel, PDF, etc. extraction is supported.)`
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get which project an attachment is linked to, by filename or path fragment.
 * Returns a short human-readable answer or null if not found.
 */
export async function getProjectForAttachmentByFilename(
  filename: string,
): Promise<string | null> {
  const trimmed = filename.trim();
  if (!trimmed) return null;

  try {
    const { rows } = await pool.query<{
      attachment_name: string | null;
      attachment_path: string | null;
      project_id: string | null;
      project_name: string | null;
    }>(
      `SELECT a.name AS attachment_name, a.path AS attachment_path,
              a.project_id, p.name AS project_name
       FROM attachments a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.name ILIKE $1 OR (a.path IS NOT NULL AND position($2 in a.path) > 0)
       LIMIT 1`,
      ["%" + trimmed + "%", trimmed],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    const projectName = r.project_name ?? r.project_id ?? "—";
    const projectId = r.project_id ?? "—";
    const attachmentLabel = r.attachment_name ?? trimmed;
    return `The attachment **${attachmentLabel}** is linked to project: **${projectName}** (id: ${projectId}).`;
  } catch {
    return null;
  }
}

/**
 * Get full context for an attachment by filename: metadata (name, path, project) and
 * extracted content. Used by the generic attachment-QA flow so the LLM can answer
 * any question (which project?, what's in it?, summarize, etc.) from one blob.
 * Returns null only if the attachment is not found in attachments and not in documents.
 */
export async function getAttachmentContextByFilename(
  filename: string,
): Promise<string | null> {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;

  const likePattern =
    "%" +
    trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_") +
    "%";

  try {
    // 1) Attachment metadata + project (attachments table)
    const { rows: attachRows } = await pool.query<{
      path: string | null;
      name: string | null;
      project_id: string | null;
      project_name: string | null;
    }>(
      `SELECT a.path, a.name, a.project_id, p.name AS project_name
       FROM attachments a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.name ILIKE $1 OR (a.path IS NOT NULL AND position($2 in a.path) > 0)
       LIMIT 1`,
      ["%" + trimmed + "%", trimmed],
    );

    // 2) Document + chunks (ingested content)
    const { rows: docRows } = await pool.query<{ id: string; path: string | null }>(
      `SELECT id, path FROM documents
       WHERE path LIKE $1 ESCAPE E'\\\\'
          OR replace(path, E'\\\\', '/') LIKE $1 ESCAPE E'\\\\'
       LIMIT 1`,
      [likePattern],
    );
    let content = "";
    let pathUsed = "";
    let nameUsed = trimmed;
    if (docRows.length > 0) {
      pathUsed = docRows[0].path ?? "";
      const { rows: chunkRows } = await pool.query<{ content: string | null }>(
        `SELECT content FROM chunks WHERE document_id = $1 ORDER BY id`,
        [docRows[0].id],
      );
      content = chunkRows.map((r) => r.content ?? "").filter(Boolean).join("\n\n");
    }

    // Prefer metadata from attachments table when available
    if (attachRows.length > 0) {
      nameUsed = attachRows[0].name ?? nameUsed;
      if (attachRows[0].path) pathUsed = attachRows[0].path;
      const projectName = attachRows[0].project_name ?? attachRows[0].project_id ?? "—";
      const projectId = attachRows[0].project_id ?? "—";
      const lines = [
        `Attachment: ${nameUsed}`,
        `Path: ${pathUsed || "—"}`,
        `Project: ${projectName} (id: ${projectId})`,
        "",
        content.trim() ? "Extracted content:\n" + content.trim() : "(No extracted content for this file.)",
      ];
      return lines.join("\n");
    }

    // No attachment row but we have an ingested document
    if (docRows.length > 0) {
      const lines = [
        `Attachment: ${nameUsed}`,
        `Path: ${pathUsed || "—"}`,
        "Project: (not linked in attachments table; everything in / is normally linked to a project)",
        "",
        content.trim() ? "Extracted content:\n" + content.trim() : "(No extracted content for this file.)",
      ];
      return lines.join("\n");
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * List the first N events with all available structured details,
 * including their linked projects.
 */
export async function listEventsWithAllDetailsContext(
  limit: number,
): Promise<string> {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

  const { rows } = await pool.query<EventWithProjectRow>(
    `SELECT
       e.id AS event_id,
       e.name AS event_name,
       e.details AS event_details,
       e.created_at AS event_created_at,
       p.id AS project_id,
       p.name AS project_name,
       p.description AS project_description
     FROM events e
     JOIN projects p ON e.project_id = p.id
     ORDER BY e.id
     LIMIT $1`,
    [n],
  );

  if (rows.length === 0) {
    return "No events were found in the events table.";
  }

  const lines = rows.map((r, idx) => {
    const title = r.event_name || "(no title)";
    const details = r.event_details || "(no details)";
    const created =
      r.event_created_at instanceof Date
        ? r.event_created_at.toISOString()
        : String(r.event_created_at ?? "").trim() || "(no created_at)";
    const projName = r.project_name || "(no project name)";
    const projDesc = r.project_description || "(no project description)";
    return `${idx + 1}. Event ${r.event_id} – ${title}\n   Details: ${details}\n   Created at: ${created}\n   Project ${r.project_id} – ${projName}\n   Project description: ${projDesc}`;
  });

  return (
    `Here are the first ${rows.length} events with all available details from the events/projects tables:\n` +
    lines.join("\n\n")
  );
}

/**
 * Fetch events (and their linked projects) matching a given title (exact or partial).
 * Used to answer questions like: "Tell me about the event whose title is X".
 */
export async function getEventsByTitleContext(title: string): Promise<string> {
  const search = title.trim();
  if (!search) return "";

  const { rows } = await pool.query<EventWithProjectRow>(
    `SELECT
       e.id AS event_id,
       e.name AS event_name,
       e.details AS event_details,
       e.created_at AS event_created_at,
       p.id AS project_id,
       p.name AS project_name,
       p.description AS project_description
     FROM events e
     JOIN projects p ON e.project_id = p.id
     WHERE LOWER(e.name) = LOWER($1)
        OR e.name ILIKE '%' || $1 || '%'
     ORDER BY e.id
     LIMIT 20`,
    [search]
  );

  if (rows.length === 0) return "";

  const lines = rows.map(
    (r) =>
      `- Event ${r.event_id}${r.event_name ? ` (${r.event_name})` : ""}: ` +
      `(created at: ${
        r.event_created_at instanceof Date
          ? r.event_created_at.toISOString()
          : String(r.event_created_at ?? "").trim() || "unknown"
      }). ` +
      `linked to Project ${r.project_id}${r.project_name ? ` (${r.project_name})` : ""}. ` +
      (r.project_description ? `Project: ${r.project_description}. ` : "") +
      (r.event_details ? `Event details: ${r.event_details}` : "")
  );

  return (
    `Events matching title "${search}" and their linked projects:\n` +
    lines.join("\n")
  );
}

/**
 * List the first N events with their titles.
 */
export async function listEventsWithTitlesContext(limit: number): Promise<string> {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  const { rows } = await pool.query<{ id: string; name: string | null }>(
    `SELECT id, name
     FROM events
     ORDER BY id
     LIMIT $1`,
    [n]
  );

  if (rows.length === 0) {
    return "No events were found in the events table.";
  }

  const lines = rows.map((r, idx) => {
    const title = r.name || "(no title)";
    return `${idx + 1}. ${r.id} – ${title}`;
  });

  return `Here are the first ${rows.length} events and their titles from events.csv:\n` +
    lines.join("\n");
}
