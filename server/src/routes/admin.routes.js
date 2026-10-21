import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import {
  cancelAppointment,
  complete,
  createAppointment,
  getAppointment,
  listAppointments,
  rescheduleAppointment,
  updateStatus,
} from '../controllers/adminAppointments.controller.js';
import {
  appointments as clientAppointments,
  create,
  getById,
  history,
  list,
  update,
} from '../controllers/adminClients.controller.js';
import {
  barberServices,
  barbers,
  categories,
  createBarberHandler,
  createCategoryHandler,
  createServiceHandler,
  createTimeOffHandler,
  deleteServiceHandler,
  deleteTimeOffHandler,
  replaceBarberServices,
  replaceSchedules,
  schedules,
  services,
  timeOff,
  updateBarberHandler,
  updateCategoryHandler,
  updateServiceHandler,
} from '../controllers/adminCatalog.controller.js';
import {
  createProductHandler,
  createSale,
  movements,
  paymentMethods,
  payments,
  products,
  saleById,
  sales,
  stock,
  updateProductHandler,
  voidSaleHandler,
} from '../controllers/adminInventory.controller.js';
import { audit, dashboard } from '../controllers/adminDashboard.controller.js';
import { settings, update as updateSettings } from '../controllers/adminSettings.controller.js';
import {
  listReviews,
  updateReview,
} from '../controllers/adminReviews.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

// Agenda y citas
adminRouter.get('/appointments', asyncHandler(listAppointments));
adminRouter.post('/appointments', asyncHandler(createAppointment));
adminRouter.get('/appointments/:id', asyncHandler(getAppointment));
adminRouter.patch('/appointments/:id/status', asyncHandler(updateStatus));
adminRouter.post('/appointments/:id/cancel', asyncHandler(cancelAppointment));
adminRouter.post('/appointments/:id/reschedule', asyncHandler(rescheduleAppointment));
adminRouter.post('/appointments/:id/complete', asyncHandler(complete));

// Clientes
adminRouter.get('/clients', asyncHandler(list));
adminRouter.post('/clients', asyncHandler(create));
adminRouter.get('/clients/:id', asyncHandler(getById));
adminRouter.patch('/clients/:id', asyncHandler(update));
adminRouter.get('/clients/:id/history', asyncHandler(history));
adminRouter.get('/clients/:id/appointments', asyncHandler(clientAppointments));

// Catálogo
adminRouter.get('/services', asyncHandler(services));
adminRouter.post('/services', asyncHandler(createServiceHandler));
adminRouter.patch('/services/:id', asyncHandler(updateServiceHandler));
adminRouter.delete('/services/:id', asyncHandler(deleteServiceHandler));

adminRouter.get('/categories', asyncHandler(categories));
adminRouter.post('/categories', asyncHandler(createCategoryHandler));
adminRouter.patch('/categories/:id', asyncHandler(updateCategoryHandler));

adminRouter.get('/barbers', asyncHandler(barbers));
adminRouter.post('/barbers', asyncHandler(createBarberHandler));
adminRouter.patch('/barbers/:id', asyncHandler(updateBarberHandler));
adminRouter.get('/barbers/:barberId/schedules', asyncHandler(schedules));
adminRouter.put('/barbers/:barberId/schedules', asyncHandler(replaceSchedules));
adminRouter.get('/barbers/:barberId/services', asyncHandler(barberServices));
adminRouter.put('/barbers/:barberId/services', asyncHandler(replaceBarberServices));

// Bloqueos
adminRouter.get('/time-off', asyncHandler(timeOff));
adminRouter.post('/time-off', asyncHandler(createTimeOffHandler));
adminRouter.delete('/time-off/:id', asyncHandler(deleteTimeOffHandler));

// Caja e inventario
adminRouter.get('/products', asyncHandler(products));
adminRouter.post('/products', asyncHandler(createProductHandler));
adminRouter.patch('/products/:id', asyncHandler(updateProductHandler));
adminRouter.post('/products/:id/stock', asyncHandler(stock));
adminRouter.get('/products/:id/movements', asyncHandler(movements));

adminRouter.get('/sales', asyncHandler(sales));
adminRouter.post('/sales', asyncHandler(createSale));
adminRouter.get('/sales/:id', asyncHandler(saleById));
adminRouter.post('/sales/:id/void', asyncHandler(voidSaleHandler));

adminRouter.get('/payments', asyncHandler(payments));
adminRouter.get('/payment-methods', asyncHandler(paymentMethods));

// Configuración, reseñas y auditoría
adminRouter.get('/settings', asyncHandler(settings));
adminRouter.patch('/settings', asyncHandler(updateSettings));
adminRouter.get('/reviews', asyncHandler(listReviews));
adminRouter.patch('/reviews/:id', asyncHandler(updateReview));
adminRouter.get('/audit', asyncHandler(audit));

// Métricas
adminRouter.get('/dashboard', asyncHandler(dashboard));
