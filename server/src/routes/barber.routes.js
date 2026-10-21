import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import {
  agenda,
  cancelAppointment,
  clients,
  complete,
  createAppointment,
  createTimeOffHandler,
  deleteTimeOffHandler,
  getAppointment,
  timeOffList,
  updateStatus,
} from '../controllers/barber.controller.js';

export const barberRouter = Router();

barberRouter.use(requireAuth, requireRole('admin', 'barbero'));

barberRouter.get('/agenda', asyncHandler(agenda));
barberRouter.get('/clients', asyncHandler(clients));
barberRouter.get('/appointments/:id', asyncHandler(getAppointment));
barberRouter.post('/appointments', asyncHandler(createAppointment));
barberRouter.patch('/appointments/:id/status', asyncHandler(updateStatus));
barberRouter.post('/appointments/:id/cancel', asyncHandler(cancelAppointment));
barberRouter.post('/appointments/:id/complete', asyncHandler(complete));
barberRouter.get('/time-off', asyncHandler(timeOffList));
barberRouter.post('/time-off', asyncHandler(createTimeOffHandler));
barberRouter.delete('/time-off/:id', asyncHandler(deleteTimeOffHandler));
