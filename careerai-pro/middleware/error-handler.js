export function wrapHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status || 500;
      const message = err.message || 'Internal server error';
      const errors = err.errors || null;

      console.error(`[${status}] ${message}`, err.stack);

      res.status(status).json({
        success: false,
        error: { message, errors, statusCode: status },
        timestamp: new Date().toISOString(),
      });
    }
  };
}