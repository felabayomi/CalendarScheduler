import { app, initializeApp } from '../dist/index.js';

let isInitialized = false;

export default async function handler(req, res) {
  if (!isInitialized) {
    await initializeApp();
    isInitialized = true;
  }

  if (req.url === '/favicon.ico' && req.method === 'GET') {
    return res.status(204).end();
  }

  return app(req, res);
}
