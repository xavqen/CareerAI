export function validateBody(schema) {
  return (req) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      throw { status: 400, message: 'Validation failed', errors };
    }
    req.body = result.data;
  };
}

export function validateQuery(schema) {
  return (req) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      throw { status: 400, message: 'Validation failed', errors };
    }
    req.query = result.data;
  };
}