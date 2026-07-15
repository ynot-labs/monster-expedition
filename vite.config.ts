import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "widget",
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "../dist/widget",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    // MCP resources are served as one local HTML document. Pixi otherwise emits
    // renderer chunks that a `ui://` resource cannot resolve relative to itself.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
