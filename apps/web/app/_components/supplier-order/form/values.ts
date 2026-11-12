import {
  type CreateSupplierOrderInput,
  type SupplierOrder,
  type UpdateSupplierOrderInput,
  monthSchema,
  supplierSchema,
} from '@vinyl-order/shared';
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
 * is in dollars. toCreateInput / toUpdateInput turn it into the API's body on
 * submit, so what is easy to type and what the API stores can each stay as
 * they are.
 *
 * The limits mirror the shared create and update schemas' so a mistake is shown on its
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
  // Blank: unpaid, e.g. cash on pickup.
  paidAt: z.union([z.iso.date(), z.literal('')], { error: 'Pick the date you paid' }),
  trackingNumber: z.string().trim().max(100),
  note: z.string().trim().max(1000),
  items: z
    .array(
      z.object({
        // The line's id when editing one that's saved, '' for a new line. Not
        // `id`: useFieldArray keys its rows by an `id` of its own.
        lineId: z.string(),
        title: z.string().trim().min(1, 'Enter the record').max(300),
        quantity: z
          .string()
          .trim()
          .regex(/^\d+$/, '1–99')
          .refine((value) => Number(value) >= 1 && Number(value) <= 99, '1–99'),
        price: dollars,
        // A month input gives '' when cleared; Safari, which has no month
        // picker, shows a text box, so the message says what to type.
        expectedMonth: z.union([monthSchema, z.literal('')], {
          error: 'A month, as YYYY-MM',
        }),
      }),
    )
    .min(1, 'Add at least one record')
    .max(50),
});
export type SupplierOrderFormValues = z.infer<typeof supplierOrderFormSchema>;

/** A blank line: one copy, nothing else known yet. */
export const blankLine: SupplierOrderFormValues['items'][number] = {
  lineId: '',
  title: '',
  quantity: '1',
  price: '',
  expectedMonth: '',
};

/**
 * A blank form, ordered and paid today — most orders are paid at checkout —
 * with one line to fill in.
 */
export const blankSupplierOrderForm = (): SupplierOrderFormValues => {
  const today = todayInTaipei();
  return {
    supplier: '',
    orderNumber: '',
    orderedAt: today,
    total: '',
    paidAt: today,
    trackingNumber: '',
    note: '',
    items: [blankLine],
  };
};

/**
 * A saved order as the form's values, to edit it. Money back to dollars and
 * null back to blank, the reverse of what saving does.
 */
export const toFormValues = (order: SupplierOrder): SupplierOrderFormValues => {
  return {
    supplier: order.supplier,
    orderNumber: order.orderNumber,
    orderedAt: order.orderedAt,
    total: order.totalCents === null ? '' : String(order.totalCents / 100),
    paidAt: order.paidAt ?? '',
    trackingNumber: order.trackingNumber ?? '',
    note: order.note ?? '',
    items: order.items.map((item) => {
      return {
        lineId: item.id,
        title: item.title,
        quantity: String(item.quantity),
        price: String(item.unitPriceCents / 100),
        expectedMonth: item.expectedMonth ?? '',
      };
    }),
  };
};

const toCents = (dollarsText: string): number => Number(dollarsText) * 100;

/**
 * What a new and an edited order send alike, from values that passed
 * supplierOrderFormSchema. Blank optional fields are sent as null rather than
 * '': blank means "not known", which is what null says.
 */
const toOrderFields = (values: SupplierOrderFormValues) => {
  return {
    orderNumber: values.orderNumber.trim(),
    orderedAt: values.orderedAt,
    totalCents: values.total.trim() ? toCents(values.total.trim()) : null,
    paidAt: values.paidAt || null,
    trackingNumber: values.trackingNumber.trim() || null,
    note: values.note.trim() || null,
  };
};

const toLineFields = (item: SupplierOrderFormValues['items'][number]) => {
  return {
    title: item.title.trim(),
    quantity: Number(item.quantity),
    unitPriceCents: toCents(item.price.trim()),
    expectedMonth: item.expectedMonth || null,
  };
};

/** POST /supplier-orders's body. */
export const toCreateInput = (values: SupplierOrderFormValues): CreateSupplierOrderInput => {
  return {
    // The form schema only passes a known shop, so this can't throw.
    supplier: supplierSchema.parse(values.supplier),
    ...toOrderFields(values),
    items: values.items.map(toLineFields),
  };
};

/**
 * PATCH /supplier-orders/:id's body for an edit: every field, the lines as
 * the whole list (saved ones with their id), and the version the form was
 * filled from, so an edit made from an out-of-date copy is refused rather
 * than saved over a newer one. No shop: it can't change. No status: that
 * moves from the list's menu, with its own rules.
 *
 * @param version - the `updatedAt` of the order the form was filled from
 */
export const toUpdateInput = (
  values: SupplierOrderFormValues,
  version: string,
): UpdateSupplierOrderInput => {
  return {
    ...toOrderFields(values),
    items: values.items.map((item) => {
      return { ...(item.lineId ? { id: item.lineId } : {}), ...toLineFields(item) };
    }),
    expectedUpdatedAt: version,
  };
};
