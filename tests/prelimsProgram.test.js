const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

// Isolate the new router from the live database and existing authentication.
let stored = null;
require.cache[require.resolve('../models/PrelimsProgram')] = { exports: {
  findOne: async () => stored,
  findOneAndUpdate: async (filter, update) => { stored = { ...update.$set, slug: filter.slug }; return stored; }
} };
require.cache[require.resolve('../middleware/auth')] = { exports: {
  protect: (req, res, next) => req.headers.authorization ? next() : res.status(401).end(),
  admin: (req, res, next) => req.headers.authorization === 'Bearer admin' ? next() : res.status(403).end()
} };

test('Prelims API: read, protected save, provider links and unsafe URL rejection', async () => {
  const app = express(); app.use(express.json()); app.use('/program', require('../routes/prelimsProgram'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/program`;
  const put = (body, token) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal(await (await fetch(url)).json(), null);
    assert.equal((await put({ title: 'Prelims' })).status, 401);
    assert.equal((await put({ title: 'Prelims' }, 'student')).status, 403);
    const sessions = ['https://youtube.com/watch?v=example', 'https://zoom.us/j/123', 'https://drive.google.com/file/d/example/view'].map(link => ({ title: 'Geography', date: '2026-11-16', time: '14:00', link }));
    assert.equal((await put({ title: 'Prelims', sessions, slug: 'forbidden-change' }, 'admin')).status, 200);
    const saved = await (await fetch(url)).json();
    assert.deepEqual(saved.sessions, sessions);
    assert.equal(saved.slug, 'prelims-plus-2027');
    assert.equal((await put({ sessions: [{ title: 'Unsafe', link: 'javascript:alert(1)' }] }, 'admin')).status, 400);
    assert.equal((await put({ sessions: [{ title: 'Unsafe', link: '//untrusted.example' }] }, 'admin')).status, 400);
    assert.equal((await put({ sessions: {} }, 'admin')).status, 400);
    assert.equal((await put({ image: 'https://res.cloudinary.com/test/image/upload/poster.png', brochure: 'https://res.cloudinary.com/test/raw/upload/brochure.pdf' }, 'admin')).status, 200);
    const uploaded = await (await fetch(url)).json();
    assert.match(uploaded.image, /poster.png$/); assert.match(uploaded.brochure, /brochure.pdf$/);
    assert.equal((await put({ image: '', brochure: '', facultyImage: '' }, 'admin')).status, 200);
    const cleared = await (await fetch(url)).json();
    assert.equal(cleared.image, ''); assert.equal(cleared.brochure, ''); assert.equal(cleared.facultyImage, '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
