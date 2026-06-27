import jwt from 'jsonwebtoken';

export const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const verifyToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split(' ')[1];
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const withAuth = (handler) => async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    req.user = verifyToken(req);
    return await handler(req, res);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};