// Auth schemas + types shared by apps/web (form validation, response parsing)
// and apps/api (DTO validation, response shaping). One source of truth for the
// auth contract so the client and server can never drift apart.
//
// Zod v4: string formats are top-level validators (`z.email()`, `z.uuid()`),
// not the deprecated `z.string().email()` chain.
import { z } from 'zod';

/**
 * POST /auth/login body.
 * Password is only checked for presence here — strength rules apply at
 * registration, not login.
 */
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * POST /auth/register body.
 * `name` is optional; when present it's trimmed and length-bounded.
 */
export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Canonical set of user roles — the cross-boundary contract (web + api).
 * Must stay in sync with the `Role` enum in the API's Prisma schema (that one
 * is the DB source of truth; this is the wire/UI contract). Add a role in both.
 */
export const roleSchema = z.enum(['customer', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/**
 * The safe-to-expose shape of a User — i.e. a User with `passwordHash`
 * stripped. The API shapes its responses to this; the web can parse against it.
 *
 * Note: `createdAt`/`updatedAt` are `Date` on the server (Prisma) but arrive as
 * ISO strings over JSON. Parse with `publicUserSchema` only on the server side,
 * or coerce on the client if you parse there.
 */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  role: roleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;
