import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const buildMetaPath = path.join(rootDir, "public", "build-meta.json");
const LOCKED_DISPLAY_VERSION = "1.0.0.10";

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeExec(command, fallback = "") {
  try {
    return execSync(command, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return fallback;
  }
}

function formatBangkokDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

function getPackageVersion() {
  const pkg = safeReadJson(packageJsonPath, {});
  return pkg.version || "1.0.0";
}

function getCommitHash() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    safeExec("git rev-parse HEAD", "")
  );
}

function getShortCommitHash(fullHash) {
  return fullHash ? fullHash.slice(0, 7) : "";
}

function getCommitMessage() {
  return (
    process.env.VERCEL_GIT_COMMIT_MESSAGE ||
    safeExec("git log -1 --pretty=%B", "")
  );
}

function getChangedFiles() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  const currentSha = process.env.VERCEL_GIT_COMMIT_SHA || "";

  if (previousSha && currentSha && previousSha !== currentSha) {
    const diff = safeExec(`git diff --name-only ${previousSha} ${currentSha}`, "");
    return diff.split("\n").map((x) => x.trim()).filter(Boolean);
  }

  const headFiles = safeExec("git diff-tree --no-commit-id --name-only -r HEAD", "");
  return headFiles.split("\n").map((x) => x.trim()).filter(Boolean);
}

function getBuildNumber(previousMeta) {
  const commitCount = safeExec("git rev-list --count HEAD", "");

  if (commitCount && !Number.isNaN(Number(commitCount))) {
    return Number(commitCount);
  }

  if (typeof previousMeta?.buildNumber === "number") {
    return previousMeta.buildNumber + 1;
  }

  return 1;
}

function main() {
  const previousMeta = safeReadJson(buildMetaPath, {});
  const baseVersion = getPackageVersion();
  const fullCommitHash = getCommitHash();
  const shortCommitHash = getShortCommitHash(fullCommitHash);
  const commitMessage = getCommitMessage();
  const changedFiles = getChangedFiles();
  const buildNumber = getBuildNumber(previousMeta);
  const updatedAt = formatBangkokDateTime(new Date());

  // Keep the user-facing version fixed until we intentionally change it.
  const displayVersion = LOCKED_DISPLAY_VERSION;
  const releaseLabel = `v${displayVersion}`;

  const nextMeta = {
    appName: "qa-dashboard",
    version: baseVersion,
    displayVersion,
    buildNumber,
    releaseLabel,
    updatedAt,
    timezone: "Asia/Bangkok",
    author: "Songpon Phothong",
    commitHash: fullCommitHash,
    commitMessage,
    changedFiles,
    releaseNotesTitle: "Latest Updates",
    releaseNotes: [],
  };

  fs.mkdirSync(path.dirname(buildMetaPath), { recursive: true });
  fs.writeFileSync(buildMetaPath, JSON.stringify(nextMeta, null, 2), "utf8");

  console.log("build-meta.json generated successfully");
  console.log(JSON.stringify(nextMeta, null, 2));
}

main();
