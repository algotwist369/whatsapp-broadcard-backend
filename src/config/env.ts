import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

// Load .env once, centrally
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional().nullable(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  FRONTEND_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ADMIN_PHONE: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Aggregate errors for clear diagnostics
  const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  // Fail fast in production; warn in development/test
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Invalid environment configuration: ${errors}`);
  } else {
    console.warn(`⚠️ Invalid environment configuration: ${errors}`);
  }
}

const env = {
  NODE_ENV: parsed.success ? parsed.data.NODE_ENV : (process.env.NODE_ENV as any) || 'development',
  PORT: parsed.success ? parsed.data.PORT : process.env.PORT,
  MONGODB_URI: parsed.success ? parsed.data.MONGODB_URI : process.env.MONGODB_URI!,
  REDIS_HOST: parsed.success ? parsed.data.REDIS_HOST : process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parsed.success ? parsed.data.REDIS_PORT : process.env.REDIS_PORT || '6379',
  REDIS_PASSWORD: parsed.success ? (parsed.data.REDIS_PASSWORD || undefined) : process.env.REDIS_PASSWORD,
  JWT_SECRET: parsed.success ? parsed.data.JWT_SECRET : process.env.JWT_SECRET!,
  FRONTEND_URL: parsed.success ? parsed.data.FRONTEND_URL : process.env.FRONTEND_URL,
  OPENAI_API_KEY: parsed.success ? parsed.data.OPENAI_API_KEY : process.env.OPENAI_API_KEY,
  ADMIN_PHONE: parsed.success ? parsed.data.ADMIN_PHONE : process.env.ADMIN_PHONE,
};

export default env;

