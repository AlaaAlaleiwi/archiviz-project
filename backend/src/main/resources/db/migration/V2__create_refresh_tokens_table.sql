CREATE TABLE IF NOT EXISTS refresh_tokens (
    id                  VARCHAR(36) PRIMARY KEY,
    user_id             VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at          TIMESTAMP,
    replaced_by_token_id VARCHAR(36) REFERENCES refresh_tokens(id) ON DELETE SET NULL,

    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
