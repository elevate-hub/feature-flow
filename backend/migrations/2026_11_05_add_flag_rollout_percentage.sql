ALTER TABLE flags
    ADD COLUMN rollout_percentage INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_flags_rollout_percentage
        CHECK (rollout_percentage BETWEEN 0 AND 100);
