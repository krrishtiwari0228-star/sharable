import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const nextConfigDirectory = path.dirname(
  require.resolve("eslint-config-next/package.json"),
);
const compat = new FlatCompat({
  baseDirectory: process.cwd(),
  resolvePluginsRelativeTo: nextConfigDirectory,
});

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mobile/**",
  ]),
]);
