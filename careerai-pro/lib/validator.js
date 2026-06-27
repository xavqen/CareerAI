import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const chatSchema = z.object({
  conversationId: z.number().int().positive(),
  model: z.string().min(1),
  provider: z.enum(['gemini', 'grok']),
  message: z.string().min(1, 'Message cannot be empty').max(10000),
});

export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  model: z.string().optional(),
});

export const premiumOrderSchema = z.object({
  plan: z.enum(['daily', 'monthly', 'yearly']),
});

export function validate(schema) {
  return (data) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      return { valid: false, errors };
    }
    return { valid: true, data: result.data, errors: null };
  };
}