import { type CreateSupplierOrderInput, supplierSchema } from '@vinyl-order/shared';
import { z } from 'zod';

import { todayInTaipei } from '@/lib/utils/date';

/**
 * Whole New Taiwan dollars, as typed. TWD is priced without decimals in
 * practice, so a decimal point is a typo rather than cents.
 */
const dollars = z.string().trim().regex(/^\d+$/, 'Whole NT$ only');

/** The same, or blank for a figure the user doesn't have. */
const optionalDollars = z.string().trim().regex(/^\d*$/, 'Whole NT$ only');

/**
 * The form's own shape: every input holds a string, as inputs do, and money
 * is in dollars. toCreateInput turns it into the API's body on submit, so what
 * is easy to type and what the API stores can each stay as they are.
 *
 * The limits mirror createSupplierOrderSchema's so a mistake is shown on its
 * field before anything is sent; the API checks again and has the last word.
 */
export const supplierOrderFormSchema = z.object({
  // A plain string, as the select holds one ('' before a pick); checked
  // against the shared list so a value the API doesn't know can't pass.
  supplier: z.string().refine((value) => supplierSchema.safeParse(value).success, {
    message: 'Pick the shop',
  }),
  orderNumber: z.string().trim().min(1, "Enter the shop's order number").max(100),
  orderedAt: z.iso.date('Pick the date you ordered'),
  total: optionalDollars,
  trackingNumber: z.string().trim().max(100),
  note: z.string().trim().max(1000),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Enter the record').max(300),
        quantity: z
          .string()
          .trim()
          .regex(/^\d+$/, '1–99')
          .refine((value) => Number(value) >= 1 && Number(value) <= 99, '1–99'),
        price: dollars,
        // A date input gives '' when cleared.
        expectedAt: z.union([z.iso.date(), z.literal('')]),
      }),
    )
    .min(1, 'Add at least one record')
    .max(50),
});
export type SupplierOrderFormValues = z.infer<typeof supplierOrderFormSchema>;

/** A blank line: one copy, nothing else known yet. */
export const blankLine: SupplierOrderFormValues['items'][number] = {
  title: '',
  quantity: '1',
  price: '',
  expectedAt: '',
};

/** A blank form, ordered today, with one line to fill in. */
export const blankSupplierOrderForm = (): SupplierOrderFormValues => {
  return {
    supplier: '',
    orderNumber: '',
    orderedAt: todayInTaipei(),
    total: '',
    trackingNumber: '',
    note: '',
    items: [blankLine],
  };
};

const toCents = (dollarsText: string): number => Number(dollarsText) * 100;

/**
 * The API's body from values that passed supplierOrderFormSchema. Blank
 * optional fields are sent as null rather than '': blank means "not known",
 * which is what null says.
 */
export const toCreateInput = (values: SupplierOrderFormValues): CreateSupplierOrderInput => {
  return {
    // The form schema only passes a known shop, so this can't throw.
    supplier: supplierSchema.parse(values.supplier),
    orderNumber: values.orderNumber.trim(),
    orderedAt: values.orderedAt,
    totalCents: values.total.trim() ? toCents(values.total.trim()) : null,
    trackingNumber: values.trackingNumber.trim() || null,
    note: values.note.trim() || null,
    items: values.items.map((item) => {
      return {
        title: item.title.trim(),
        quantity: Number(item.quantity),
        unitPriceCents: toCents(item.price.trim()),
        expectedAt: item.expectedAt || null,
      };
    }),
  };
};
