import { registerSchema } from '@vinyl-order/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * Request body for POST /auth/register.
 * Derives validation + type from the shared registerSchema.
 */
export class RegisterDto extends createZodDto(registerSchema) {}
