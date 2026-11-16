import { defineConfig } from "tsdown";

// The build for npm: ES modules in build/, with their declarations. The workspace uses the source (main is src/index.ts).
export default defineConfig({
  entry: ["src/index.ts", "src/schema.ts", "src/add-on.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  fixedExtension: false,
  sourcemap: true,
  dts: true,
  publint: true,
});
