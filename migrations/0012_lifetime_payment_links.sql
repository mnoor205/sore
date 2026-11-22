-- Founding lifetime access is sold through one Stripe Payment Link per price tier.
-- Each link is capped at LTD_STEP_EVERY completed checkouts, so Stripe itself
-- retires a tier and the next (higher) tier link takes over.
CREATE TABLE lifetime_links(product_id TEXT NOT NULL,tier INTEGER NOT NULL,amount INTEGER NOT NULL,size INTEGER NOT NULL,price_id TEXT NOT NULL,link_id TEXT NOT NULL UNIQUE,url TEXT NOT NULL,sold_out INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(product_id,tier));
-- A payment-link buyer may pay before they have a store. The purchase waits here,
-- keyed to the sign-in identity of the email they paid with, until their store claims it.
CREATE TABLE lifetime_purchases(session_id TEXT PRIMARY KEY,link_id TEXT NOT NULL,tier INTEGER NOT NULL,amount INTEGER NOT NULL,payment_intent TEXT,customer_id TEXT,email TEXT,owner_id TEXT,store_id TEXT,status TEXT NOT NULL DEFAULT 'paid',created_at INTEGER NOT NULL);
CREATE INDEX lifetime_purchases_owner ON lifetime_purchases(owner_id) WHERE store_id IS NULL;
CREATE INDEX lifetime_purchases_intent ON lifetime_purchases(payment_intent);
