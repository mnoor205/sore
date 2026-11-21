CREATE TABLE creator_sessions (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, email TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX creator_sessions_expiry ON creator_sessions(expires_at);
CREATE TABLE creator_login_states (nonce_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
