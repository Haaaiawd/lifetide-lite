import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: [".next/", "node_modules/", "tmp/", "test-results/", "reports/", "*.d.ts", "**/*.mjs", "**/*.js", "eslint.config.*"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  }
);
