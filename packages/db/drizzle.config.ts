import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
