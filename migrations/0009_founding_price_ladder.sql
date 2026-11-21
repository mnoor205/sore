-- Founding lifetime price ladder: each reservation records the USD amount (minor units)
-- it was offered at, so the webhook can confirm Stripe charged exactly that tier.
ALTER TABLE billing_sessions ADD COLUMN amount INTEGER;
