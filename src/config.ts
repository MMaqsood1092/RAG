import "dotenv/config";

export const config = {
  voyageKey: process.env.VOYAGE_API_KEY!,
  huggingfaceKey: process.env.HUGGINGFACE_API_KEY!,
  dbUrl: process.env.DATABASE_URL!,
  port: Number(process.env.PORT) || 3000,
};
