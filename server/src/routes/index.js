import { Router } from 'express';
import { publicRouter } from './public.routes.js';
import { authRouter } from './auth.routes.js';
import { adminRouter } from './admin.routes.js';
import { barberRouter } from './barber.routes.js';

export const apiRouter = Router();

apiRouter.use('/', publicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/barber', barberRouter);
