-- Shared, creator-managed speech preference; existing contacts retain voice defaults.
ALTER TABLE contact_agent ADD COLUMN speech_accent TEXT CHECK (speech_accent IS NULL OR speech_accent IN ('AR', 'UY', 'MX', 'ES', 'CL', 'CO', 'PE', 'VE', 'US', 'GB', 'AU', 'IE', 'BR', 'PT', 'FR', 'IT', 'DE'));
