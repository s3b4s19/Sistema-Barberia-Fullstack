import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import {
  availability,
  availabilityDay,
  cancelAppointment,
  createAppointment,
  createReview,
  getAppointment,
  health,
  publicBarbers,
  publicHours,
  publicServices,
  publicSettings,
  rescheduleAppointment,
  reviews,
} from '../controllers/public.controller.js';

export const publicRouter = Router();

publicRouter.get('/health', asyncHandler(health));

publicRouter.get('/public/settings', asyncHandler(publicSettings));
publicRouter.get('/public/services', asyncHandler(publicServices));
publicRouter.get('/public/barbers', asyncHandler(publicBarbers));
publicRouter.get('/public/hours', asyncHandler(publicHours));
publicRouter.get('/public/reviews', asyncHandler(reviews));

publicRouter.get(
  '/public/availability/day',
  rateLimit({ windowMs: 60_000, max: 90, prefix: 'day-availability' }),
  asyncHandler(availabilityDay),
);

publicRouter.get('/availability', asyncHandler(availability));

publicRouter.post(
  '/appointments',
  rateLimit({ windowMs: 15 * 60_000, max: 10, prefix: 'booking' }),
  asyncHandler(createAppointment),
);

publicRouter.get(
  '/appointments/:code',
  rateLimit({ windowMs: 60_000, max: 30, prefix: 'lookup' }),
  asyncHandler(getAppointment),
);

publicRouter.post(
  '/appointments/:code/cancel',
  rateLimit({ windowMs: 15 * 60_000, max: 15, prefix: 'cancel' }),
  asyncHandler(cancelAppointment),
);

publicRouter.post(
  '/appointments/:code/reschedule',
  rateLimit({ windowMs: 15 * 60_000, max: 15, prefix: 'reschedule' }),
  asyncHandler(rescheduleAppointment),
);

publicRouter.post(
  '/reviews',
  rateLimit({ windowMs: 60 * 60_000, max: 5, prefix: 'review' }),
  asyncHandler(createReview),
);
