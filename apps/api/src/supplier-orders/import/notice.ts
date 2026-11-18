import type { Supplier } from '@vinyl-order/shared';

/** What a notice says about an order already recorded (tracker.md §9.5). */
export type OrderNotice =
  | {
      kind: 'paid';
      orderNumber: string;
      /** `YYYY-MM-DD`, the day the shop says it was paid. */
      paidAt: string;
    }
  | {
      kind: 'shipped';
      orderNumber: string;
      /** The parcel's, when the notice gives one; it fills only an empty field. */
      trackingNumber: string | null;
    };

/** A shop's reading of one notice, or why it couldn't be read. */
export type NoticeRead = { ok: true; notice: OrderNotice } | { ok: false; reason: string };

/** A notice, with the shop its sender stands for. */
export type ParsedNotice = OrderNotice & { supplier: Supplier };

/**
 * What reading a notice came to. A reason is a short phrase for the 422 and
 * the logs — never a quote of the email, which carries personal details.
 */
export type NoticeResult = { ok: true; notice: ParsedNotice } | { ok: false; reason: string };
