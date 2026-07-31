import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { app, attachErrorHandler } from './app.js';

// Local/traditional-server entry point only — adds serving the built client
// and app.listen(), neither of which apply to the Vercel deploy (Vercel
// serves client/dist as static output directly, and api/index.js wraps
// app.js for serverless instead of listening on a port).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../client/dist');

app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

attachErrorHandler(app);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
