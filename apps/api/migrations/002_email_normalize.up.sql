-- Normalize existing emails to lowercase
UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL;
UPDATE auth_providers SET email = LOWER(email) WHERE email IS NOT NULL;

-- Replace case-sensitive unique constraint with case-insensitive unique index
ALTER TABLE users DROP CONSTRAINT users_email_key;
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));