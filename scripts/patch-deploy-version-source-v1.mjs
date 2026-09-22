import fs from "node:fs";

const appFile = "src/App.tsx";
const viteFile = "vite.config.js";
const marker = "// deploy-version-embedded-sha-v1";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  return source.replace(before, after);
}

let app = fs.readFileSync(appFile, "utf8");
if (!app.includes(marker)) {
  app = replaceOnce(
    app,
    `type BuildMeta = {\n  appName?: string;\n  version: string;\n  displayVersion?: string;\n  updatedAt: string;\n  releaseLabel: string;\n  author: string;\n  buildNumber: number;\n  releaseNotesTitle?: string;\n  releaseNotes: string[];\n  changedFiles: string[];\n  commitHash?: string;\n  commitMessage?: string;\n  timezone?: string;\n};`,
    `type BuildMeta = {\n  appName?: string;\n  version: string;\n  displayVersion?: string;\n  updatedAt: string;\n  releaseLabel: string;\n  author: string;\n  buildNumber: number;\n  releaseNotesTitle?: string;\n  releaseNotes: string[];\n  changedFiles: string[];\n  commitHash?: string;\n  commitMessage?: string;\n  timezone?: string;\n};\n\n${marker}\nconst EMBEDDED_DEPLOY_COMMIT_SHA = String(import.meta.env.VITE_DEPLOY_COMMIT_SHA || "").trim();`,
    "BuildMeta type"
  );

  app = replaceOnce(
    app,
    `  const [buildMeta, setBuildMeta] = useState<BuildMeta>(DEFAULT_BUILD_META);`,
    `  const [buildMeta, setBuildMeta] = useState<BuildMeta>(() => ({\n    ...DEFAULT_BUILD_META,\n    commitHash: EMBEDDED_DEPLOY_COMMIT_SHA || DEFAULT_BUILD_META.commitHash,\n  }));`,
    "buildMeta state"
  );

  app = replaceOnce(
    app,
    `          commitHash: String(data?.commitHash ?? DEFAULT_BUILD_META.commitHash),`,
    `          commitHash: EMBEDDED_DEPLOY_COMMIT_SHA || String(data?.commitHash ?? DEFAULT_BUILD_META.commitHash),`,
    "buildMeta fetched commit hash"
  );

  app = replaceOnce(
    app,
    `        setBuildMeta(DEFAULT_BUILD_META);`,
    `        setBuildMeta({\n          ...DEFAULT_BUILD_META,\n          commitHash: EMBEDDED_DEPLOY_COMMIT_SHA || DEFAULT_BUILD_META.commitHash,\n        });`,
    "buildMeta fallback"
  );

  app = replaceOnce(
    app,
    `  const shortBuildHash = buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "";`,
    `  const shortBuildHash = (EMBEDDED_DEPLOY_COMMIT_SHA || buildMeta.commitHash || "").slice(0, 7);`,
    "shortBuildHash"
  );

  fs.writeFileSync(appFile, app, "utf8");
}

let vite = fs.readFileSync(viteFile, "utf8");
if (!vite.includes("VITE_DEPLOY_COMMIT_SHA")) {
  vite = replaceOnce(
    vite,
    `export default defineConfig({\n  plugins:`,
    `const deployCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";\n\nexport default defineConfig({\n  define: {\n    "import.meta.env.VITE_DEPLOY_COMMIT_SHA": JSON.stringify(deployCommitSha),\n  },\n  plugins:`,
    "Vite config"
  );
  fs.writeFileSync(viteFile, vite, "utf8");
}

console.log("Applied embedded production deploy SHA v1");
