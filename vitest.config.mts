import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which TypeScript
// understands for typechecking but Vitest needs told about separately.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
