import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/room-view". A local build uses the root.
const site = process.env["SITE_BASE"];

const page = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: site ? `${site.replace(/\/$/, "")}/` : "/",
  build: {
    target: "es2022",
    // The site has two pages: the home page with the sample room, and the page "Measure a room".
    rolldownOptions: { input: { home: page("./index.html"), measure: page("./measure/index.html") } },
  },
});
