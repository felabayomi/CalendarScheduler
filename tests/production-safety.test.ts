import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { registerRoutes } from "../server/routes";
import { stopReminderScheduler } from "../server/reminders";

test("initializeApp does not duplicate middleware or routes on repeated Vercel startup calls", async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const { app, initializeApp } = await import("../dist/index.js");
    const before = (app as any)._router.stack.length;
    await initializeApp();
    const afterFirst = (app as any)._router.stack.length;
    await initializeApp();
    const afterSecond = (app as any)._router.stack.length;

    assert.equal(afterSecond, afterFirst, "Repeated initializeApp calls should not add duplicate routes");
    assert.ok(afterSecond >= before, "Route stack should remain stable across repeated initialization");
  } finally {
    stopReminderScheduler();
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("login rejects malformed username and password payloads before querying storage", async () => {
  const serverApp = express();
  serverApp.use(express.json());
  await registerRoutes(serverApp);

  const server = serverApp.listen(0);
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: 123, password: { invalid: true } }),
    });

    assert.equal(response.status, 401, "Malformed credentials should return 401");
    const body = await response.json();
    assert.equal(body.message, "Invalid credentials");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
});
