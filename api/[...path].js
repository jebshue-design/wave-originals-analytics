import serverless from 'serverless-http';
import { app, attachErrorHandler } from '../server/app.js';

// Vercel serverless entry point — wraps the same Express app used for local
// dev (server/app.js), minus static file serving (Vercel serves
// client/dist directly as static output, configured in vercel.json).
attachErrorHandler(app);

export default serverless(app);
