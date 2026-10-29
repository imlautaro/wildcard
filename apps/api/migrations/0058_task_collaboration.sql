-- Structured collaboration on existing tasks and documents. A task can name the
-- chat document it produces or edits; a reviewer can reopen a finished blocker with
-- feedback at most twice, so draft/review loops always end.
ALTER TABLE task ADD COLUMN document_id TEXT REFERENCES chat_document(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN review_rounds INTEGER NOT NULL DEFAULT 0 CHECK (review_rounds BETWEEN 0 AND 2);
ALTER TABLE task ADD COLUMN review_feedback TEXT CHECK (review_feedback IS NULL OR length(review_feedback) <= 2000);
CREATE INDEX task_document ON task(document_id) WHERE document_id IS NOT NULL;
