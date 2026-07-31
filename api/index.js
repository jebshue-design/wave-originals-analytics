import { app, attachErrorHandler } from '../server/app.js';

// Vercel serverless entry point — minus static file serving (Vercel serves
// client/dist directly as static output, configured in vercel.json).
//
// An Express app is itself a valid (req, res) handler, so it's exported
// directly rather than through an AWS-Lambda-style adapter (serverless-http)
// — that adapter translates requests into a synthetic Lambda "event" object,
// and on Vercel that translation was losing the real request path (Express
// was seeing "/" for every request instead of e.g. "/api/auth/session").
attachErrorHandler(app);

export default app;
