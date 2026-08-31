-- ===== FICHE EDITOR - SCHEMA SQL =====
-- A coller dans Supabase SQL Editor

-- Table utilisateurs
CREATE TABLE fiche_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'professor' CHECK (role IN ('professor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table fiches
CREATE TABLE fiches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fiche_users(id) ON DELETE CASCADE,
  annee TEXT NOT NULL,
  faculte TEXT NOT NULL,
  matiere TEXT NOT NULL,
  numero INTEGER NOT NULL,
  titre TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fiches_user_id ON fiches(user_id);
CREATE INDEX idx_fiches_updated_at ON fiches(updated_at DESC);

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fiches_updated_at
  BEFORE UPDATE ON fiches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE fiche_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own" ON fiche_users
  FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "fiches_select_own" ON fiches
  FOR SELECT USING (
    user_id IN (SELECT id FROM fiche_users WHERE auth_id = auth.uid())
  );

CREATE POLICY "fiches_insert_own" ON fiches
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM fiche_users WHERE auth_id = auth.uid())
  );

CREATE POLICY "fiches_update_own" ON fiches
  FOR UPDATE USING (
    user_id IN (SELECT id FROM fiche_users WHERE auth_id = auth.uid())
  );

CREATE POLICY "fiches_delete_own" ON fiches
  FOR DELETE USING (
    user_id IN (SELECT id FROM fiche_users WHERE auth_id = auth.uid())
  );
