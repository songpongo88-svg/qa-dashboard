import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const packageJsonPath = path.join(rootDir, "package.json");
const buildMetaPath = path.join(publicDir, "build-meta.json");
const releaseNotesPath = path.join(publicDir, "release-notes.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getThailandTimestamp() {
  const now = new Date();

  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return `${datePart} ${timePart}`;
}

function getGitCommitHash() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function getGitChangedFiles() {
  try {
    const output = execSync("git diff-tree --no-commit-id --name-only -r HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!output) return [];
    return output.split("\n").map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function getGitCommitMessage() {
  try {
    return execSync("git log -1 --pretty=%B", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

ensureDir(publicDir);

const packageJson = readJson(packageJsonPath, {});
const previousBuildMeta = readJson(buildMetaPath, {});
const releaseNotes = readJson(releaseNotesPath, {
  title: "Latest Updates",
  items: [],
});

const nextBuildNumber = Number(previousBuildMeta.buildNumber || 0) + 1;
const version = packageJson.version || "1.0.0";
const updatedAt = getThailandTimestamp();
const commitHash = getGitCommitHash();
const commitMessage = getGitCommitMessage();
const changedFiles = getGitChangedFiles();

const buildMeta = {
  appName: packageJson.name || "qa-dashboard",
  version,
  buildNumber: nextBuildNumber,
  releaseLabel: `v${version} build ${nextBuildNumber}`,
  updatedAt,
  timezone: "Asia/Bangkok",
  author: "Songpon Phothong",
  commitHash,
  commitMessage,
  changedFiles,
  releaseNotesTitle: releaseNotes.title || "Latest Updates",
  releaseNotes: Array.isArray(releaseNotes.items) ? releaseNotes.items : [],
};

writeJson(buildMetaPath, buildMeta);

console.log("Generated build-meta.json successfully");
console.log(buildMeta);
