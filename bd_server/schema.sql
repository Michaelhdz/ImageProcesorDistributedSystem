-- schema.sql
-- Ejecutar: psql -U postgres -d imageprocessing -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(80)  UNIQUE NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nodes (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100),
  host         VARCHAR(200) NOT NULL,
  port         INTEGER      NOT NULL,
  status       VARCHAR(20)  DEFAULT 'INACTIVE',
  last_ping_at TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_node_status CHECK (status IN ('ACTIVE','INACTIVE','ERROR')),
  CONSTRAINT uq_node_host_port UNIQUE (host, port)
);

CREATE TABLE IF NOT EXISTS batches (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(20) DEFAULT 'PENDING',
  total_images     INTEGER NOT NULL,
  processed_images INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  completed_at     TIMESTAMP,
  CONSTRAINT chk_batch_status
    CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED'))
);

CREATE TABLE IF NOT EXISTS image_jobs (
  id                 SERIAL PRIMARY KEY,
  batch_id           INTEGER REFERENCES batches(id)  ON DELETE CASCADE,
  node_id            INTEGER REFERENCES nodes(id)     ON DELETE SET NULL,
  original_filename  VARCHAR(255) NOT NULL,
  local_input_path   VARCHAR(500) NOT NULL,
  local_result_path  VARCHAR(500),
  status             VARCHAR(20) DEFAULT 'PENDING',
  received_at        TIMESTAMP DEFAULT NOW(),
  converted_at       TIMESTAMP,
  error_message      TEXT,
  CONSTRAINT chk_job_status
    CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED'))
);

CREATE TABLE IF NOT EXISTS transformations (
  id            SERIAL PRIMARY KEY,
  image_job_id  INTEGER REFERENCES image_jobs(id) ON DELETE CASCADE,
  type          VARCHAR(30) NOT NULL,
  params        JSONB,
  exec_order    INTEGER NOT NULL,
  CONSTRAINT chk_max_order  CHECK (exec_order BETWEEN 1 AND 5),
  CONSTRAINT chk_trans_type CHECK (type IN (
    'GRAYSCALE','RESIZE','CROP','ROTATE','FLIP',
    'BLUR','SHARPEN','BRIGHTNESS_CONTRAST','WATERMARK','CONVERT'
  ))
);

CREATE TABLE IF NOT EXISTS job_logs (
  id                  SERIAL PRIMARY KEY,
  image_job_id        INTEGER REFERENCES image_jobs(id) ON DELETE CASCADE,
  node_id             INTEGER REFERENCES nodes(id)      ON DELETE SET NULL,
  level               VARCHAR(10) DEFAULT 'INFO',
  transformation_type VARCHAR(30),
  message             TEXT NOT NULL,
  context             JSONB,
  ts                  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_log_level CHECK (level IN ('INFO','WARN','ERROR'))
);

CREATE TABLE node_metrics (id SERIAL PRIMARY KEY, node_id VARCHAR(50), cpu_usage FLOAT, ram_usage FLOAT, active_threads INTEGER, ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_batches_user  ON batches(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_batch    ON image_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_logs_job      ON job_logs(image_job_id);
