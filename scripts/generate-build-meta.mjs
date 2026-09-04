import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import "./patch-coaching-dashboard-parity-v27.mjs";
import "./patch-coaching-topic3-classifier-v27b.mjs";
import "./patch-coaching-case-evidence-v28.mjs";
import "./patch-coaching-month-first-agent-v29.mjs";
import "./patch-coaching-main-issues-summary-v30.mjs";
import "./patch-coaching-checklist-schedule-v31.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const buildMetaPath = path.join(rootDir, "public", "build-meta.json");

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

function formatBangkokBuildStamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}${map.hour}:${map.minute}`.replace(":", "");
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

function buildReleaseNotes(commitMessage, changedFiles) {
  const messageLines = String(commitMessage || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^merge\b/i.test(line));

  const notes = [];
  for (const line of messageLines) {
    if (!notes.includes(line)) notes.push(line);
    if (notes.length >= 4) break;
  }

  if (!notes.length && changedFiles.length) {
    const names = changedFiles
      .slice(0, 4)
      .map((file) => path.basename(file))
      .join(", ");
    notes.push(`Updated ${changedFiles.length} file(s): ${names}${changedFiles.length > 4 ? ", ..." : ""}`);
  }

  return notes.length ? notes : ["Latest build is ready."];
}

function main() {
  const baseVersion = getPackageVersion();
  const fullCommitHash = getCommitHash();
  const shortCommitHash = getShortCommitHash(fullHash = fullCommitHash);
  const commitMessage = getCommitMessage();
  const changedFiles = getChangedFiles();
  const now = new Date();
  const buildStamp = formatBangkokBuildStamp(now);
  const buildNumber = Number(buildStamp);
  const updatedAt = formatBangkokDateTime(now);

  const displayVersion = `${baseVersion}.${buildStamp}`;
  const releaseLabel = `v${displayVersion}`;
  const releaseNotes = buildReleaseNotes(commitMessage, changedFiles);

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
    releaseNotesTitle: "เวอร์ชันนี้ปรับอะไร",
    releaseNotes,
  };

  fs.mkdirSync(path.dirname(buildMetaPath), { recursive: true });
  fs.writeFileSync(buildMetaPath, JSON.stringify(nextMeta, null, 2), "utf8");

  console.log("build-meta.json generated successfully");
  console.log(JSON.stringify({ ...nextMeta, shortCommitHash }, null, 2));
}

main();
