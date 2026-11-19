-- 180: AI assistant actions (AI Agent, phase 5 start).
-- The assistant may only PROPOSE an action. It is stored here as 'pending' and
-- shown to the user as a card; nothing changes until that same user confirms it.
-- The action then runs through the normal service with the user's own permissions
-- and is written to audit_logs.

CREATE TABLE IF NOT EXISTS ai_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  kind            VARCHAR(60) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- title + lines shown on the card
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'done', 'cancelled', 'failed', 'expired')),
  result          JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_user ON ai_actions (user_id, created_at DESC);
