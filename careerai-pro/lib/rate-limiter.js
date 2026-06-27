const store = new Map();

export function rateLimiter({ windowMs = 60000, max = 10 } = {}) {
  return (identifier) => {
    const now = Date.now();
    const key = identifier;
    const entry = store.get(key);

    if (!entry || now - entry.start > windowMs) {
      store.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: max - 1, reset: now + windowMs };
    }

    entry.count++;
    const remaining = max - entry.count;
    return {
      allowed: remaining >= 0,
      remaining: Math.max(0, remaining),
      reset: entry.start + windowMs,
    };
  };
}

const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const apiLimiter = rateLimiter({ windowMs: 60 * 1000, max: 60 });

export function checkAuthRateLimit(ip) {
  return authLimiter(ip);
}

export function checkApiRateLimit(ip) {
  return apiLimiter(ip);
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.start > 15 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);