import { checkAuthRateLimit, checkApiRateLimit } from '../lib/rate-limiter.js';

export function authRateLimit(req) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const result = checkAuthRateLimit(ip);
  if (!result.allowed) {
    throw {
      status: 429,
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }
}

export function apiRateLimit(req) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const result = checkApiRateLimit(ip);
  if (!result.allowed) {
    throw {
      status: 429,
      message: 'Rate limit exceeded. Please slow down.',
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }
}