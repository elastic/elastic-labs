CREATE DATABASE IF NOT EXISTS elaspic
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE elaspic;

CREATE TABLE users (
  id            CHAR(36)     NOT NULL,
  username      VARCHAR(64)  NOT NULL,
  email         VARCHAR(255) NOT NULL,
  salt          VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE session_tokens (
  token       VARCHAR(128) NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  expires_at  DATETIME(3)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token),
  KEY idx_session_tokens_user_id (user_id),
  KEY idx_session_tokens_expires_at (expires_at),
  CONSTRAINT fk_session_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pictures (
  id                CHAR(36)     NOT NULL,
  owner_user_id     CHAR(36)     NOT NULL,
  author            VARCHAR(64)  NOT NULL,
  base64            LONGTEXT     NOT NULL,
  thumbnail_base64  LONGTEXT     NOT NULL,
  deleted           TINYINT(1)   NOT NULL DEFAULT 0,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_pictures_owner_list (owner_user_id, deleted, created_at),
  CONSTRAINT fk_pictures_owner
    FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT fk_pictures_author
    FOREIGN KEY (author) REFERENCES users (username)
) ENGINE=InnoDB;

CREATE TABLE comments (
  id           CHAR(36)     NOT NULL,
  picture_id   CHAR(36)     NOT NULL,
  author       VARCHAR(64)  NOT NULL,
  comment_text TEXT         NULL,
  deleted      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_comments_picture_list (picture_id, deleted, created_at),
  CONSTRAINT fk_comments_picture
    FOREIGN KEY (picture_id) REFERENCES pictures (id),
  CONSTRAINT fk_comments_author
    FOREIGN KEY (author) REFERENCES users (username)
) ENGINE=InnoDB;
