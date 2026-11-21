-- Maps products imported from another platform back to their source, so re-imports skip duplicates.
CREATE TABLE import_sources(store_id TEXT NOT NULL,source TEXT NOT NULL,source_id TEXT NOT NULL,product_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(store_id,source,source_id));
