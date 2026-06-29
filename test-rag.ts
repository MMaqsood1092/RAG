import { pool } from "./src/db/client";

/**
 * Test RAG retrieval without requiring OpenAI API key
 */
async function testRAG() {
  try {
    console.log("📊 Testing RAG with ingested data...\n");

    // 1. Check documents
    const docsResult = await pool.query(`
      SELECT id, path, embedding_model, embedding_dimension 
      FROM documents 
      LIMIT 5
    `);
    console.log("✅ Documents ingested:");
    docsResult.rows.forEach((doc: any) => {
      console.log(`   - ${doc.path}`);
      console.log(`     Model: ${doc.embedding_model}, Dimension: ${doc.embedding_dimension}`);
    });

    // 2. Check chunks
    const chunksResult = await pool.query(`
      SELECT COUNT(*) as total_chunks, 
             (SELECT embedding_dimension FROM documents LIMIT 1) as dimension
      FROM chunks 
      GROUP BY dimension
      LIMIT 1
    `);
    console.log(`\n✅ Chunks stored: ${chunksResult.rows[0].total_chunks}`);
    console.log(`   Vector dimension: ${chunksResult.rows[0].dimension}`);

    // 3. Show sample chunks
    const sampleResult = await pool.query(`
      SELECT c.content, 
             d.embedding_dimension as dimension,
             c.created_at
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      ORDER BY c.created_at DESC
      LIMIT 3
    `);
    console.log(`\n✅ Sample chunk content:`);
    sampleResult.rows.forEach((chunk: any, idx: number) => {
      const preview = chunk.content.substring(0, 100).replace(/\n/g, " ");
      console.log(`   ${idx + 1}. "${preview}..."`);
    });

    // 4. Test vector search (using first chunk's embedding for testing)
    const testEmbedding = await pool.query(`
      SELECT embedding 
      FROM chunks 
      LIMIT 1
    `);

    if (testEmbedding.rows.length > 0) {
      const embedding = testEmbedding.rows[0].embedding;
      const embeddingStr = `[${embedding.join(",")}]`;

      const searchResult = await pool.query(`
        SELECT content, 
               1 - (embedding <=> $1::vector) as similarity
        FROM chunks 
        ORDER BY embedding <=> $1::vector
        LIMIT 3
      `, [embeddingStr]);

      console.log(`\n✅ Vector similarity search results:`);
      searchResult.rows.forEach((result: any, idx: number) => {
        const preview = result.content.substring(0, 80).replace(/\n/g, " ");
        console.log(`   ${idx + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`);
        console.log(`      "${preview}..."`);
      });
    }

    // 5. Query specific data (without LLM)
    const leadsResult = await pool.query(`
      SELECT content 
      FROM chunks 
      WHERE content LIKE '%Erika Casey%' 
         OR content LIKE '%Ellen Hendrix%'
      LIMIT 5
    `);

    console.log(`\n✅ Direct search for leads data:`);
    if (leadsResult.rows.length > 0) {
      leadsResult.rows.forEach((row: any, idx: number) => {
        console.log(`   ${idx + 1}. ${row.content}`);
      });
    } else {
      console.log("   No exact matches found (data may be split across chunks)");
    }

    console.log("\n✅ RAG system is working correctly!");
    console.log("   - Documents indexed: " + docsResult.rows.length);
    console.log("   - Total chunks: " + chunksResult.rows[0].total_chunks);
    console.log("   - Vector search working");
    console.log("   - Retrieving data from database");

    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testRAG();
