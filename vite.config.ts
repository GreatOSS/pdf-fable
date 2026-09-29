import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173, strictPort: false },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
