/**
 * Mock HuggingFace Service for offline testing
 * Returns realistic responses without hitting external APIs
 */

export class MockHuggingFaceService {
  constructor(_apiKey: string = "mock") {
    // Mock service - no API key needed
  }

  /**
   * Mock text generation - simulates Mistral-7B responses
   */
  async generateText(
    prompt: string,
    _modelId: string = "mistralai/Mistral-7B-Instruct-v0.1",
    _options?: { maxTokens?: number; temperature?: number; topP?: number }
  ): Promise<string> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Extract context from prompt for intelligent mocking
    const lowerPrompt = prompt.toLowerCase();

    // SQL Generation
    if (
      lowerPrompt.includes("schema") &&
      lowerPrompt.includes("user question")
    ) {
      // Extract the question from prompt
      const questionMatch = prompt.match(/user question:\s*(.+?)(?:\n|$)/i);
      const question = questionMatch ? questionMatch[1] : "";

      if (question.includes("mcknight")) {
        return JSON.stringify({
          is_sql_query: true,
          sql:
            "SELECT * FROM chunks WHERE content ILIKE '%Mcknight%' LIMIT 10",
          reason: "Query asks for leads from Mcknight",
        });
      }

      if (question.includes("ellen")) {
        return JSON.stringify({
          is_sql_query: true,
          sql:
            "SELECT * FROM chunks WHERE content ILIKE '%Ellen%' LIMIT 10",
          reason: "Query asks for Ellen",
        });
      }

      return JSON.stringify({
        is_sql_query: false,
        reason: "Question requires context beyond schema",
      });
    }

    // Query Expansion
    if (
      lowerPrompt.includes("rewrite") &&
      lowerPrompt.includes("follow-up")
    ) {
      const followUpMatch = prompt.match(/follow-up:\s*(.+?)(?:\n|$)/i);
      const followUp = followUpMatch ? followUpMatch[1].trim() : "";

      if (followUp.includes("more details")) {
        return "Tell me more details about Mcknight leads";
      }
      if (followUp.includes("more")) {
        return "Show me more information about the leads";
      }

      return followUp || "Expand on the previous topic";
    }

    // Attachment QA
    if (lowerPrompt.includes("answer the user's question")) {
      const contextMatch = prompt.match(/context:\s*([\s\S]*?)\n\nuser question:/i);
      const context = contextMatch ? contextMatch[1] : "";

      if (
        context.includes("Ellen") &&
        prompt.toLowerCase().includes("company")
      ) {
        return (
          "Based on the data, Ellen Hendrix works for Anderson, Huff and Davis. " +
          "She is a lead with Account ID JnJCAnLEBN and Lead Owner is Erika Casey. " +
          "Her email is lydiamaldonado@gonzalez.net."
        );
      }

      if (
        context.includes("Mcknight") &&
        prompt.toLowerCase().includes("leads")
      ) {
        return (
          "We have multiple leads from Mcknight PLC:\n" +
          "1. Justin Bruce - Charlene Huynh (Lead Owner), Account ID: x9kRLpIanV\n" +
          "2. Justin B. - Charlene Huynh (Lead Owner), Account ID: x9kRLpIanV\n" +
          "The source is Partner Program with Qualified deal stage."
        );
      }

      if (
        context.includes("Charlene") &&
        prompt.toLowerCase().includes("email")
      ) {
        return (
          "Charlene Huynh's contact information:\n" +
          "Primary Email: ehendricks@fleming.com\n" +
          "Secondary Email: hensonjake@snow.com\n" +
          "Associated Company: Mcknight PLC"
        );
      }

      // Generic response based on context
      if (context.length > 50) {
        return (
          "Based on the provided data, I can help answer questions about the leads. " +
          "The context contains information about various leads including names, companies, " +
          "contact information, and deal stages. Please ask a specific question."
        );
      }

      return "I cannot find relevant information in the provided context.";
    }

    // General chat
    if (lowerPrompt.includes("system prompt")) {
      const questionMatch = prompt.match(/question:\s*(.+?)(?:\n|$)/i);
      const question = questionMatch ? questionMatch[1].trim() : "";

      if (question.includes("mcknight")) {
        return (
          "Based on our ingested leads data, we have several leads from Mcknight PLC. " +
          "The primary contacts are Justin Bruce and variations, with Charlene Huynh as the lead owner. " +
          "These are qualified leads from the Partner Program channel."
        );
      }

      if (question.includes("Erika")) {
        return (
          "Ellen Hendrix is a lead for Anderson, Huff and Davis with lead owner Erika Casey. " +
          "The account ID is JnJCAnLEBN. This is a re-engagement stage lead sourced through other channels."
        );
      }

      if (question.includes("email")) {
        return (
          "The leads database contains email information for various contacts. " +
          "For example, Charlene Huynh's email is ehendricks@fleming.com, " +
          "and Ellen Hendrix's email is lydiamaldonado@gonzalez.net."
        );
      }

      return (
        "I'm a helpful assistant with access to leads data. " +
        "I can help you find information about specific leads, companies, or contacts from our database."
      );
    }

    // Default fallback
    return "I can help you with that. Please provide more details.";
  }

  /**
   * Mock embeddings - returns consistent random vectors
   */
  async embed(
    texts: string[],
    _modelId: string = "sentence-transformers/all-mpnet-base-v2"
  ): Promise<number[][]> {
    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    const embeddings: number[][] = [];

    for (const text of texts) {
      // Generate consistent embedding based on text hash
      const hash = this.simpleHash(text);
      const embedding: number[] = [];

      // Generate 1024-dimensional vector (for voyage-3-lite compatibility)
      for (let i = 0; i < 1024; i++) {
        // Use hash to generate pseudo-random but consistent values
        const value = Math.sin(hash + i * 0.1) * Math.cos(i * 0.01);
        embedding.push(parseFloat(value.toFixed(6)));
      }

      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Mock question answering
   */
  async questionAnswer(
    question: string,
    context: string,
    _modelId: string = "deepset/roberta-base-squad2"
  ): Promise<{ answer: string; score: number }> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Search for answer in context
    const lowerQuestion = question.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (
      lowerQuestion.includes("ellen") &&
      lowerContext.includes("ellen")
    ) {
      return {
        answer: "Ellen Hendrix works for Anderson, Huff and Davis",
        score: 0.92,
      };
    }

    if (
      lowerQuestion.includes("mcknight") &&
      lowerContext.includes("mcknight")
    ) {
      return {
        answer:
          "Mcknight PLC has qualified leads in the Partner Program",
        score: 0.88,
      };
    }

    if (
      lowerQuestion.includes("email") &&
      lowerContext.includes("@")
    ) {
      return {
        answer:
          "The email addresses are provided in the contact information",
        score: 0.85,
      };
    }

    return {
      answer: "Information not found in context",
      score: 0.0,
    };
  }

  /**
   * Simple hash function for consistent pseudo-random values
   */
  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

export const mockHuggingfaceService = new MockHuggingFaceService();
