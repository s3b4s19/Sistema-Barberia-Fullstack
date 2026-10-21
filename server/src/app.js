import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { rateLimit } from './middlewares/rateLimit.js';
import { notFoundHandler } from './lib/http.js';

export const app = express();

app.disable('x-powered-by');

if (env.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: env.nodeEnv === 'production',
  }),
);

app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '100kb' }));

app.use(
  rateLimit({
    windowMs: 60_000,
    max: env.rateLimitMax,
    prefix: 'api',
  }),
);

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
