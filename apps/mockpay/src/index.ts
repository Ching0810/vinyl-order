/**
 * What MockPay offers whoever mounts it: the module, and the shapes of its
 * answers. Its sessions, page and webhooks stay internal — a real provider's
 * would be out of reach too, so nothing outside should depend on them.
 */
export { MockPayModule } from './mockpay.module';
export type { CreateSessionResponse } from './dto/create-session.dto';
export type { ExpireSessionResponse } from './dto/expire-session.dto';
