import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { markable } from "../../../src/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    markable({
      inject: false,
      endpoint: "/__markable/comments",
      commentsFile: ".markable/comments.json",
    }),
  ],
  resolve: {
    alias: {
      "@f12o/markable/browser": path.resolve(__dirname, "../../../src/browser.ts"),
    },
  },
});
