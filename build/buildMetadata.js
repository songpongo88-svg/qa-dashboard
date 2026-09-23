import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Vite owns this metadata, including builds that do not run npm's prebuild hook.
export function createBuildMetadata(root, env = process.env, now = new Date()) {
  const git = (...args) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return ''; }
  };
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const commitHash = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || git('rev-parse', 'HEAD');
  const commitMessage = env.VERCEL_GIT_COMMIT_MESSAGE || git('log', '-1', '--pretty=%B');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const buildNumber = now.getTime();
  const displayVersion = `${pkg.version}:${commitHash.slice(0, 7) || buildNumber}`;
  return {
    appName: pkg.name, version: pkg.version, commitHash, commitMessage,
    buildId: `${commitHash || pkg.version}:${buildNumber}`,
    buildNumber, displayVersion, releaseLabel: `v${displayVersion}`,
    updatedAt: `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`,
    timezone: 'Asia/Bangkok', author: 'Songpon Phothong', changedFiles: [],
    releaseNotesTitle: 'เวอร์ชันนี้ปรับอะไร',
    releaseNotes: commitMessage.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 5),
  };
}

export function buildMetadataPlugin(meta) {
  let root;
  const content = JSON.stringify(meta, null, 2);
  return {
    name: 'qa-build-metadata', enforce: 'pre',
    configResolved(config) { root = config.root; },
    load(id) {
      if (id.split('?')[0] === path.join(root, 'public/build-meta.json')) return content;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/build-meta.json') return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(content);
      });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-meta.json', source: content }); },
  };
}
