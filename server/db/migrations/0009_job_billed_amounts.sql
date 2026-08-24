-- subtotal_usd/fee_usd/total_usd are the estimate escrowed at job creation
-- (full max_runtime_hours). A completed job is actually billed for elapsed
-- time only (see agent.js POST /job/:id/complete), with the difference
-- refunded — these columns capture what was really kept, so the API can
-- report the true amount instead of echoing the original escrow hold.
ALTER TABLE jobs
  ADD COLUMN billed_subtotal_usd NUMERIC(12,2),
  ADD COLUMN billed_fee_usd      NUMERIC(12,2),
  ADD COLUMN billed_total_usd    NUMERIC(12,2);
