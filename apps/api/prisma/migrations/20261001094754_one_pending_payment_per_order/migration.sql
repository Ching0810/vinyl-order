-- At most one pending payment attempt per order.
--
-- Two Pay presses at once both find no pending attempt and both open a
-- provider session; without this, both rows are inserted and the customer has
-- two payment pages for one order. With it, the second insert fails, and the
-- API answers with the first attempt's page instead.
--
-- Partial (WHERE status = 'pending'), so failed and succeeded attempts don't
-- count: a declined card can still be followed by a new attempt.
--
-- Prisma's schema cannot express a partial index, so this lives only here.
-- Existing rows need no cleanup: no code creates payments yet.
CREATE UNIQUE INDEX "Payment_orderId_pending_key"
  ON "Payment" ("orderId")
  WHERE status = 'pending';
