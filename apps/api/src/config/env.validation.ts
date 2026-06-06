import { z } from 'zod';

/**
 * Every environment variable the API depends on, in one place. Validated once
 * at boot (see ConfigModule.forRoot in AppModule) so a missing/invalid var
 * fails fast and loudly at startup instead of surfacing as a vague runtime
 * error deep in a request later.
 *
 * This is also the contract across environments: local dev reads .env files,
 * production (e.g. Cloud Run) injects the same vars via the platform — both go
 * through this schema.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Postgres connection string (consumed by Prisma).
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().min(1, 'JWT_EXPIRES_IN is required'),

  // CORS browser allowlist (comma-separated origins). Optional: unset -> no
  // cross-origin browser access allowed.
  WEB_ORIGIN: z.string().optional(),

  // Discogs catalog API (server-side only — the token is a secret, never shipped
  // to the browser). A descriptive User-Agent is required by Discogs.
  DISCOGS_TOKEN: z.string().min(1, 'DISCOGS_TOKEN is required'),
  DISCOGS_USER_AGENT: z.string().min(1).default('VinylOrder/0.1'),

  // Image storage. Dev writes to a local folder served at /uploads; prod will
  // use 'gcs'. PUBLIC_API_URL builds the absolute URL stored on Product.imageUrl.
  STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  PUBLIC_API_URL: z.string().min(1).default('http://localhost:3001'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }). Receives the merged env
 * (process.env + loaded .env files); throws with a readable list on any
 * invalid/missing var, otherwise returns the parsed (and coerced) values.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
