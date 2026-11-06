CREATE TABLE external_user_group_memberships (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_external_group_user_key UNIQUE (group_id, user_key)
);

CREATE INDEX idx_external_group_memberships_group_id
    ON external_user_group_memberships(group_id);
