/**
 * Retry utility for database operations
 * Handles temporary connection issues on serverless platforms
 */

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = "Database operation"
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;

      // Only retry on connection errors
      const isConnectionError =
        err.code === "ECONNRESET" ||
        err.code === "ENOTFOUND" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.message?.includes("Connection refused") ||
        err.message?.includes("timed out") ||
        err.message?.includes("ECONNRESET");

      if (isConnectionError && attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.warn(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries}), ` +
          `retrying in ${delay}ms: ${err.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Don't retry on other errors or last attempt
        throw err;
      }
    }
  }

  throw lastError;
}
