// Cloudflare accepts at most 100 ASCII letters, digits, underscores or hyphens.
export function validWorkflowID(id: string): boolean {
  return /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,99}$/.test(id);
}

export async function normalizedWorkflowID(id: string): Promise<string> {
  if (validWorkflowID(id)) return id;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return `chat-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
