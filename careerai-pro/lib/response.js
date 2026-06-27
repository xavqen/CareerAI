export function success(res, data, meta = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
  });
}

export function error(res, message, statusCode = 400, errors = null) {
  return res.status(statusCode).json({
    success: false,
    error: { message, errors, statusCode },
    timestamp: new Date().toISOString(),
  });
}

export function paginated(res, data, page, limit, total) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
    timestamp: new Date().toISOString(),
  });
}