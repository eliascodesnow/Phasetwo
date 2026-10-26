import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

// Writes this build's file list into dist/sw.js so the service worker can precache the whole app for offline use.
function offlinePrecache(): Plugin {
  let outDir = "dist";
  const files: string[] = [];
  return {
    name: "phasetwo-offline-precache",
    apply: "build",
    configResolved(config) { outDir = join(config.root, config.build.outDir); },
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (name.endsWith(".map") || name === "sw.js") continue;
        files.push(`/${name}`);
      }
    },
    closeBundle() {
      const swPath = join(outDir, "sw.js");
      const list = files.filter((file) => file !== "/index.html").sort();
      // Icons, the manifest and the legal pages are copied as-is, so their contents go into the version too.
      const hash = createHash("sha256").update(list.join("|"));
      for (const name of readdirSync(outDir).sort()) {
        const path = join(outDir, name);
        if (name !== "sw.js" && statSync(path).isFile()) hash.update(name).update(readFileSync(path));
      }
      const version = hash.digest("hex").slice(0, 10);
      const source = readFileSync(swPath, "utf8")
        .replace('const VERSION = "dev";', `const VERSION = "${version}";`)
        .replace("const BUILD_FILES = [];", `const BUILD_FILES = ${JSON.stringify(list)};`);
      writeFileSync(swPath, source);
    },
  };
}

export default defineConfig({
  plugins: [react(), legalPages(), offlinePrecache()],
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
