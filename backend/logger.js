import pino from 'pino';
import pinoHttp from 'pino-http';

// Check if running in production (Azure Container Apps sets NODE_ENV=production)
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // JSON format in production (Azure Log Analytics can parse it)
});

// HTTP request logger middleware
export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignorePaths: ['/api/health'], // Don't log health checks (noisy)
  },
});

// Log API events (state pushes, beacons, etc.)
export function logEvent(eventType, metadata = {}) {
  logger.info({ event: eventType, ...metadata }, `[${eventType}]`);
}

// Log errors with context
export function logError(error, context = {}) {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
      ...context,
    },
    'Error occurred'
  );
}
