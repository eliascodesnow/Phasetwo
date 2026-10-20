import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The static legal pages live in public/ (privacy.html, terms.html). Production serves them at
// /privacy and /terms (vercel.json cleanUrls); this makes the dev and preview servers match.
const LEGAL_PATHS: Record<string, string> = {
  "/privacy": "/privacy.html",
  "/privacy-policy": "/privacy.html",
  "/terms": "/terms.html",
  "/terms-of-service": "/terms.html",
};

function legalPages(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query] = (req.url ?? "").split("?");
    const target = LEGAL_PATHS[path.replace(/\/+$/, "")];
    if (target) req.url = query ? `${target}?${query}` : target;
    next();
  };
  return {
    name: "phasetwo-legal-pages",
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig({
  plugins: [react(), legalPages()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks stay cached between releases, so returning visitors re-download only app code.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react") || id.includes("scheduler")) return "react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
