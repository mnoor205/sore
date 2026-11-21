CREATE TABLE creator_email_codes (challenge_hash TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX creator_email_codes_expiry ON creator_email_codes(expires_at);
