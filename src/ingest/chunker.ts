import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 900,
  chunkOverlap: 150,
});

export async function chunkText(text: string) {
  return splitter.createDocuments([text]);
}


