import { loginSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * Request body for POST /auth/login.
 * Derives validation + type from the shared loginSchema (single source of
 * truth with the web client). ZodValidationPipe reads this schema to validate.
 */
export class LoginDto extends createZodDto(loginSchema) {}
