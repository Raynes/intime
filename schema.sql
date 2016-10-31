DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE IF NOT EXISTS users (
  user_id  VARCHAR(36) PRIMARY KEY,
  username VARCHAR(256) NOT NULL,
  UNIQUE (username)
);

DROP TABLE IF EXISTS projects CASCADE;
CREATE TABLE IF NOT EXISTS projects (
  user_id             VARCHAR(36) REFERENCES users,
  project_id          VARCHAR(36) PRIMARY KEY,
  project_name        VARCHAR(256) NOT NULL,
  project_description TEXT DEFAULT NULL,
  UNIQUE (project_name, user_id)
);

DROP TABLE IF EXISTS session_start CASCADE;
CREATE TABLE IF NOT EXISTS session_start (
  user_id    VARCHAR(36) REFERENCES users,
  session_id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) REFERENCES projects,
  start_time TIMESTAMP NOT NULL,
  session_description TEXT DEFAULT NULL
);

DROP TABLE IF EXISTS session_end CASCADE;
CREATE TABLE IF NOT EXISTS session_end (
  user_id       VARCHAR(36) REFERENCES users,
  session_id    VARCHAR(36) REFERENCES session_start,
  project_id    VARCHAR(36) REFERENCES projects,
  end_time      TIMESTAMP NOT NULL,
  total_seconds INT NOT NULL
);
