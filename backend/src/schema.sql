CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS links (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  max_clicks INT,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
CREATE TABLE IF NOT EXISTS clicks (
  id BIGSERIAL PRIMARY KEY,
  link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT now(),
  referrer TEXT,
  browser TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id, clicked_at);
