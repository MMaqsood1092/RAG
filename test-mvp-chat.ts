import { chat } from "./src/api/chat";

async function testMVPChat() {
  console.log("🧪 Testing MVP Chat Endpoint (Vector Search Only)\n");

  try {
    console.log("📝 Query 1: Search for a name");
    console.log("Question: 'Erika'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let result = await chat("Erika");
    console.log(`Found ${result.results.length} results:\n`);
    result.results.forEach((r, i) => {
      console.log(`${i + 1}. [Score: ${r.score}]`);
      console.log(`   Content: ${r.content.slice(0, 150)}${r.content.length > 150 ? "..." : ""}\n`);
    });

    console.log("\n📝 Query 2: Company search");
    console.log("Question: 'Mcknight company'");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    result = await chat("Mcknight company");
    console.log(`Found ${result.results.length} results:\n`);
    result.results.forEach((r, i) => {
      console.log(`${i + 1}. [Score: ${r.score}]`);
      console.log(`   Content: ${r.content.slice(0, 150)}${r.content.length > 150 ? "..." : ""}\n`);
    });

    console.log("\n✅ MVP Chat testing complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testMVPChat();
