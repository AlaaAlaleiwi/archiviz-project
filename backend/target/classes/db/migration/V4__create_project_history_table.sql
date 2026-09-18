CREATE TABLE IF NOT EXISTS project_history (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_name    VARCHAR(255) NOT NULL,
    snapshot        JSONB NOT NULL,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_user ON project_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON project_history(created_at);
