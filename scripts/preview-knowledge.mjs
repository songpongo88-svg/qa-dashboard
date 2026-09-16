// Local-only visual harness. No production credentials or writes are used.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, appType: 'mpa', plugins: [react()], server: { host: '127.0.0.1', port: 4176, strictPort: true } });
server.middlewares.use('/knowledge-preview', async (_request, response) => {
  const html = await server.transformIndexHtml('/knowledge-preview', '<!doctype html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA Knowledge Preview — ข้อมูลตัวอย่าง</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/knowledge-preview.tsx"></script></body></html>');
  response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
});
await server.listen();
console.log('Knowledge visual preview: http://localhost:4176/knowledge-preview');
