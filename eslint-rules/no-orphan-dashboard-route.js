const fs = require("node:fs");
const path = require("node:path");

const REGISTRY_PATH_REL = "src/lib/assistant/route-registry.ts";

function loadRegisteredPaths(cwd) {
  try {
    const raw = fs.readFileSync(path.join(cwd, REGISTRY_PATH_REL), "utf8");
    // Match every `path: "/dashboard/..."` token literal. Tolerant of single/double quotes
    // and whitespace, because the registry is hand-authored.
    const found = new Set();
    const re = /\bpath:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      if (m[1].startsWith("/dashboard")) found.add(m[1]);
    }
    return found;
  } catch {
    return null; // registry missing — fall through to no-op
  }
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Every /dashboard/* page.tsx should have a ROUTE_REGISTRY entry so the AI assistant can route users here.",
    },
    schema: [],
    messages: {
      missing:
        "No matching entry in src/lib/assistant/route-registry.ts for this dashboard page. Add one so the AI assistant can deep-link here, or the assistant won't know about this feature.",
    },
  },
  create(context) {
    const filename = context.getFilename();
    const norm = filename.replace(/\\/g, "/");

    if (!norm.includes("/src/app/dashboard/")) return {};
    if (!norm.endsWith("/page.tsx")) return {};

    const cwd = context.getCwd ? context.getCwd() : process.cwd();
    const registered = loadRegisteredPaths(cwd);
    if (registered === null) return {};

    // Reconstruct the dashboard path: /src/app/dashboard/foo/bar/page.tsx → /dashboard/foo/bar
    const after = norm.split("/src/app/dashboard")[1];
    if (!after) return {};
    const dashboardPath = "/dashboard" + after.replace(/\/page\.tsx$/, "");

    return {
      Program(node) {
        if (!registered.has(dashboardPath)) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};
