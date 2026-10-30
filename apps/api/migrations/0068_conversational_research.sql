-- Existing receipts preserve their report/deletion contract. New human research
-- can return evidence directly to conversation without creating a document.
ALTER TABLE web_research ADD COLUMN delivery TEXT NOT NULL DEFAULT 'document'
  CHECK (delivery IN ('conversation', 'document'));
