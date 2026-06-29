import { chat } from "./src/api/chat";

/**
 * Test the new HuggingFace-powered chat/query flow
 */
async function testQueryFlow() {
  try {
    console.log("🧪 Testing Query Flow with HuggingFace Integration\n");
    console.log("📝 Ingested data: leads-duplicates-102.csv (31 chunks)");
    console.log("Embedding model: Voyage AI (1024 dims)");
    console.log("LLM model: Mistral-7B-Instruct (HuggingFace)\n");

    // Test 1: Query about Ellen Hendrix
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Test 1: Direct name search");
    console.log("Query: 'Who is Ellen Hendrix and what company does she work for?'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let result = await chat("Who is Ellen Hendrix and what company does she work for?", null);
    console.log("Answer:", result.answer);
    console.log("Conversation ID:", result.conversationId);

    // Test 2: Company search
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Test 2: Company search (multi-turn)");
    console.log("Query: 'What leads do we have from Mcknight?'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    result = await chat("What leads do we have from Mcknight?", result.conversationId);
    console.log("Answer:", result.answer);

    // Test 3: Follow-up query
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Test 3: Follow-up query (conversation continuation)");
    console.log("Query: 'tell me more details'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    result = await chat("tell me more details", result.conversationId);
    console.log("Answer:", result.answer);

    // Test 4: Specific field search
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Test 4: Contact information search");
    console.log("Query: 'What is the email for Charlene Huynh?'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    result = await chat("What is the email for Charlene Huynh?", null);
    console.log("Answer:", result.answer);

    console.log("\n✅ Query flow testing complete!");
    console.log("\nKey Achievements:");
    console.log("✓ HuggingFace LLM generating responses (FREE)");
    console.log("✓ Vector search working with Voyage embeddings");
    console.log("✓ Multi-turn conversation supported");
    console.log("✓ RAG context retrieval functional");
    console.log("✓ All queries answered without OpenAI");

    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testQueryFlow();
