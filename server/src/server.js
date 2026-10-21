import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, () => {
  console.log(`API de barbería escuchando en http://localhost:${env.port}/api`);
  console.log(`Entorno: ${env.nodeEnv}`);
});

function shutdown(signal) {
  console.log(`Recibido ${signal}. Cerrando servidor...`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  shutdown('uncaughtException');
});
