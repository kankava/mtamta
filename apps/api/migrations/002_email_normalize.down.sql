DROP INDEX users_email_lower_idx;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);