import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 900,
  chunkOverlap: 150,
});

function isTOC(line: string): boolean {
  const trimmed = line.trim();
  return /^(table of contents|contents|index|chapter \d+.*\.\.\.\d+)/i.test(trimmed);
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#+\s/.test(trimmed) ||
    /^[A-Z][A-Z\s]+:$/.test(trimmed) ||
    /^\d+\.\d*\.?\s+/.test(trimmed) ||
    /^[IVXLCDM]+\.\s+/.test(trimmed)
  );
}

function isBullet(line: string): boolean {
  const trimmed = line.trim();
  return /^[\*\-•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

function detectHeadingLevel(line: string): number {
  const trimmed = line.trim();
  const mdMatch = trimmed.match(/^(#+)\s/);
  if (mdMatch) return mdMatch[1].length;

  const numMatch = trimmed.match(/^(\d+\.)+\s/);
  if (numMatch) {
    const dots = (numMatch[0].match(/\./g) || []).length;
    return dots;
  }

  if (/^[A-Z][A-Z\s]+:$/.test(trimmed)) return 1;
  if (/^[IVXLCDM]+\.\s+/.test(trimmed)) return 1;

  const leadingSpaces = trimmed.match(/^\s*/)?.[0].length || 0;
  return Math.floor(leadingSpaces / 4) + 1;
}

function chunkCSVRowWise(text: string) {
  const lines = text.split('\n');
  const sections = [];
  const headers = lines[0]?.split(/[,\t]/).map(h => h.trim()) || [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(/[,\t]/).map(v => v.trim());
    let rowContent = line;

    if (headers.length > 0 && values.length === headers.length) {
      const keyValuePairs = headers.map((h, idx) => `${h}: ${values[idx]}`).join(', ');
      rowContent = keyValuePairs;
    }

    sections.push({
      pageContent: rowContent,
      metadata: { row: i, type: 'csv_row' }
    });
  }

  return sections;
}

function chunkExcelRowWise(text: string) {
  const lines = text.split('\n');
  const sections = [];
  let currentSheet = '';
  let headers: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('Sheet:')) {
      currentSheet = trimmed.replace('Sheet:', '').trim();
      headers = [];
      continue;
    }

    const values = trimmed.split(',').map(v => v.trim());

    if (headers.length === 0 && values.length > 0) {
      headers = values;
      continue;
    }

    let rowContent = trimmed;
    if (headers.length > 0 && values.length === headers.length) {
      const keyValuePairs = headers.map((h, idx) => `${h}: ${values[idx]}`).join(', ');
      rowContent = keyValuePairs;
    }

    sections.push({
      pageContent: rowContent,
      metadata: { sheet: currentSheet, type: 'excel_row' }
    });
  }

  return sections;
}

async function chunkStructuredDocument(text: string) {
  const lines = text.split('\n');
  const elements: { type: 'heading' | 'bullet' | 'paragraph' | 'toc'; content: string; level?: number }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isTOC(trimmed)) {
      elements.push({ type: 'toc', content: trimmed });
      continue;
    }

    if (isHeading(trimmed)) {
      const level = detectHeadingLevel(trimmed);
      elements.push({ type: 'heading', content: trimmed, level });
    } else if (isBullet(trimmed)) {
      elements.push({ type: 'bullet', content: trimmed });
    } else {
      elements.push({ type: 'paragraph', content: trimmed });
    }
  }

  const headingStack: { text: string; level: number }[] = [];
  let currentSectionText = '';
  const finalChunks: { pageContent: string; metadata: any }[] = [];

  async function flushSection() {
    if (!currentSectionText.trim()) return;

    const context = headingStack.map(h => h.text).join(' > ');
    const fullText = context ? `${context}\n${currentSectionText}` : currentSectionText;

    if (fullText.length > 900) {
      const subTexts = await splitter.splitText(currentSectionText);
      for (const sub of subTexts) {
        finalChunks.push({
          pageContent: context ? `${context}\n${sub}` : sub,
          metadata: { type: 'section' }
        });
      }
    } else {
      finalChunks.push({
        pageContent: fullText,
        metadata: { type: 'section' }
      });
    }
    currentSectionText = '';
  }

  for (const el of elements) {
    if (el.type === 'toc') continue;

    if (el.type === 'heading') {
      await flushSection();
      const newLevel = el.level || 0;
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= newLevel) {
        headingStack.pop();
      }
      headingStack.push({ text: el.content, level: newLevel });
      continue;
    }
    if (el.type === 'bullet' || el.type === 'paragraph') {
      currentSectionText += (currentSectionText ? '\n' : '') + el.content;
    }
  }
  await flushSection();

  return finalChunks;
}

export async function chunkText(text: string, fileType?: string) {
  if (!fileType) {
    if (text.includes('\nSheet:') || (text.includes(',') && text.split('\n').length > 2)) {
      fileType = text.includes('\nSheet:') ? 'excel' : 'csv';
    } else {
      fileType = 'text';
    }
  }

  if (fileType === 'csv') {
    const chunks = chunkCSVRowWise(text);
    return chunks.map(c => ({ pageContent: c.pageContent, metadata: c.metadata }));
  }

  if (fileType === 'excel') {
    const chunks = chunkExcelRowWise(text);
    return chunks.map(c => ({ pageContent: c.pageContent, metadata: c.metadata }));
  }

  return chunkStructuredDocument(text);
}