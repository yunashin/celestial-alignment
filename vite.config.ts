import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at yunashin.github.io/celestial-alignment, so production builds need
// the repo-name subpath; dev server stays at root.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/celestial-alignment/" : "/",
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
}));
