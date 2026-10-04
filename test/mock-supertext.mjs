#!/usr/bin/env node
/**
 * Minimal mock of the Supertext AI file translation API for local testing.
 * "Translates" by prefixing every text node with "[<target_lang>] ".
 *
 *   node test/mock-supertext.mjs            # listens on :8765, key "test-key"
 *   SUPERTEXT_API_ENDPOINT=http://localhost:8765/v1/ SUPERTEXT_API_KEY=test-key npm run develop
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { parse, TextNode } from 'node-html-parser';

const PORT = Number(process.env.PORT || 8765);
const KEY = process.env.MOCK_KEY || 'test-key';
const files = new Map();

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const translate = (html, lang) => {
  const root = parse(html, { comment: false });
  const walk = (node) => {
    if (node instanceof TextNode) {
      if (node.rawText.trim()) node.rawText = node.rawText.replace(/^(\s*)/, `$1[${lang}] `);
      return;
    }
    if (['script', 'style', 'head'].includes(node.rawTagName?.toLowerCase())) return;
    node.childNodes?.forEach(walk);
  };
  walk(root);
  return root.toString();
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/^\/v1/, '');
    console.log(new Date().toISOString().slice(11, 19), req.method, url.pathname);
    if (req.headers.authorization !== `Supertext-Auth-Key ${KEY}`) return send(res, 401, { detail: 'bad key' });
    if (path === '/features') return send(res, 200, {});

    if (req.method === 'POST' && path === '/translate/ai/file') {
      const request = new Request('http://x', { method: 'POST', headers: req.headers, body: await readBody(req) });
      const form = await request.formData();
      const file = form.get('file');
      if (!file || file.type !== 'text/html') return send(res, 415, { detail: `FILETYPE_NOT_ALLOWED ${file?.type}` });
      const id = randomBytes(6).toString('hex');
      const fields = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'file'));
      console.log('   ', JSON.stringify(fields), `${(await file.text()).length} chars`);
      files.set(id, { html: await file.text(), lang: fields.target_lang });
      return send(res, 200, { file_id: id });
    }

    const match = path.match(/^\/translate\/ai\/file\/([a-f0-9]+)(\/status|\/translation)?$/);
    if (match) {
      const [, id, sub] = match;
      if (req.method === 'DELETE') return files.delete(id), send(res, 200, {});
      const file = files.get(id);
      if (sub === '/status') return send(res, 200, { status: file ? 'done' : 'deleted' });
      if (sub === '/translation' && file) return send(res, 200, translate(file.html, file.lang), 'text/html');
    }
    send(res, 404, { detail: 'not found' });
  })
  .listen(PORT, () => console.log(`Mock Supertext API on http://localhost:${PORT}/v1/ (key "${KEY}")`));
