-- Code is private data until published; it is rendered only in opaque-origin srcDoc.
ALTER TABLE stores ADD COLUMN custom_site_json TEXT;
-- Keep version tokens increasing across publish/discard, preventing stale-tab ABA.
ALTER TABLE stores ADD COLUMN storefront_version INTEGER NOT NULL DEFAULT 0;
UPDATE stores SET storefront_version=COALESCE((SELECT version FROM storefront_drafts WHERE store_id=stores.id),0);
