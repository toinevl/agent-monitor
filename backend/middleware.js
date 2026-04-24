import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';

/**
 * Rate limiters for different endpoints
 * Using memory store (suitable for single-container deployments).
 * For distributed setups, use Redis store: npm install rate-limit-redis
 */

export const pushLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 pushes per minute (1 per second average)
  message: 'Too many session pushes, please try again later',
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  skip: (req, res) => {
    // Don't count failed auth as rate limit
    return res.statusCode === 401;
  },
  handler: (req, res) => {
    logger.warn(
      { ip: req.ip, endpoint: '/api/push' },
      'Rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

export const beaconLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 beacons per minute (varies by fleet size, conservative estimate)
  message: 'Too many beacon registrations, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
    return res.statusCode === 401;
  },
  handler: (req, res) => {
    logger.warn(
      { ip: req.ip, endpoint: '/api/beacon' },
      'Rate limit exceeded'
    );
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Bearer token authentication middleware
 */
export function authMiddleware(secretEnvVar) {
  return (req, res, next) => {
    const secret = process.env[secretEnvVar];
    if (!secret) {
      logger.error(
        { secretEnvVar },
        `Environment variable ${secretEnvVar} not set`
      );
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token || token !== secret) {
      logger.warn(
        { ip: req.ip, endpoint: req.path, hasAuth: !!authHeader },
        'Unauthorized request'
      );
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

/**
 * WebSocket token authentication
 * Extract token from query string: ws://host/?token=abc123
 */
export function validateWSToken(req) {
  const wsToken = process.env.WS_TOKEN;
  if (!wsToken) {
    // No token configured — allow all (dashboard is typically internal-only)
    // Set WS_TOKEN env var to enforce authentication
    return true;
  }

  const url = new URL(`http://localhost${req.url}`);
  const token = url.searchParams.get('token');

  if (token !== wsToken) {
    logger.warn(
      { ip: req.socket.remoteAddress, hasToken: !!token },
      'WebSocket unauthorized'
    );
    return false;
  }

  return true;
}
