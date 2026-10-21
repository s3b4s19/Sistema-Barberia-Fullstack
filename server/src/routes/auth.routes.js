import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { requireAuth } from '../middlewares/auth.js';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, prefix: 'login' }),
  asyncHandler(loginHandler),
);

authRouter.post(
  '/refresh',
  rateLimit({ windowMs: 60_000, max: 30, prefix: 'refresh' }),
  asyncHandler(refreshHandler),
);

authRouter.post('/logout', requireAuth, asyncHandler(logoutHandler));
authRouter.get('/me', requireAuth, asyncHandler(meHandler));
authRouter.post(
  '/change-password',
  requireAuth,
  rateLimit({ windowMs: 15 * 60_000, max: 5, prefix: 'change-password' }),
  asyncHandler(changePasswordHandler),
);
