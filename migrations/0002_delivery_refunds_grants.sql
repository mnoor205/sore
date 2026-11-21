ALTER TABLE outbox ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entitlements ADD COLUMN grant_json TEXT;
ALTER TABLE billing_sessions ADD COLUMN grant_json TEXT;
CREATE TABLE refunds(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),order_id TEXT NOT NULL REFERENCES orders(id),amount INTEGER NOT NULL,currency TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX refunds_store_date ON refunds(store_id,created_at);
