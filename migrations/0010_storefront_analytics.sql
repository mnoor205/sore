ALTER TABLE stores ADD COLUMN tracking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tracking_enabled IN (0,1));
ALTER TABLE stores ADD COLUMN exclude_owner_visits INTEGER NOT NULL DEFAULT 1 CHECK (exclude_owner_visits IN (0,1));
CREATE INDEX analytics_checkout_starts ON orders(store_id,created_at) WHERE is_test=0 AND status<>'free' AND session_id IS NOT NULL;
CREATE INDEX analytics_purchases ON orders(store_id,paid_at) WHERE is_test=0 AND status='paid';
