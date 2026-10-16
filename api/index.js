import { app, initializeApp } from '../dist/index.js';

let isInitialized = false;

export default async function handler(req, res) {
  if (!isInitialized) {
    await initializeApp();
    isInitialized = true;
  }

  return app(req, res);
}
