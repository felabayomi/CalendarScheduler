import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("built Vercel entry starts and serves API and frontend without development tooling", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-loader", "./tests/fixtures/reject-development-loader.mjs",
    "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { once } from 'node:events';
      const { app, initializeApp } = await import('./dist/index.js');
      const { default: handler } = await import('./api/index.js');
      assert.equal(typeof handler, 'function');
      await initializeApp();
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      try {
        const page = await fetch(base + '/');
        assert.equal(page.status, 200);
        assert.match(await page.text(), /<html/i);
        const api = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 123, password: {} })
        });
        assert.equal(api.status, 401);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    `,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VERCEL: "1", NODE_ENV: "production", DATABASE_URL: "" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
