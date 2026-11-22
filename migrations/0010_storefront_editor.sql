-- Storefront editor: structured design options on the live store, plus one private
-- AI draft per store and its chat transcript. Drafts never change the live storefront
-- until the creator publishes them from the dashboard.
ALTER TABLE stores ADD COLUMN theme_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE storefront_drafts (store_id TEXT PRIMARY KEY REFERENCES stores(id), base_json TEXT NOT NULL, draft_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE storefront_ai_messages (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), role TEXT NOT NULL CHECK (role IN ('user','assistant','event')), content TEXT NOT NULL, changes_json TEXT NOT NULL DEFAULT '[]', draft_version INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX storefront_ai_messages_store ON storefront_ai_messages(store_id, created_at);
