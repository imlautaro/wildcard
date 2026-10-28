const setupMessages = {
  endpoint_probe: 'Wildcard could not reach the MCP endpoint to start OAuth.',
  resource_metadata: 'Wildcard could not read valid OAuth resource metadata from this MCP server.',
  authorization_metadata: 'Wildcard could not read valid metadata from the authorization server.',
  client_registration: 'Wildcard could not register an OAuth client with this provider.',
  authorization_start: 'Wildcard could not prepare the authorization request.',
  saved_configuration: 'Wildcard could not read the saved OAuth configuration. Open Configure OAuth and authorize again.',
  flow_storage: 'Wildcard could not save the authorization request. Please try again.',
  token_exchange: 'Wildcard could not exchange the authorization code with this provider. Authorize again.',
} as const;
type SetupStage = keyof typeof setupMessages;
type DnsDiagnostic = {
  resolver: 'cloudflare';
  type?: 'A' | 'AAAA';
  reason: 'network' | 'timeout' | 'http' | 'invalid_response' | 'resolver_failure' | 'private_address' | 'no_addresses' | 'not_found';
  httpStatus?: number;
};
export class DnsFailure extends Error {
  constructor(code: 'MCP_DNS' | 'MCP_DNS_UNAVAILABLE', readonly diagnostics: DnsDiagnostic[]) { super(code); }
}
const knownCodes = new Set(['MCP_DNS', 'MCP_DNS_UNAVAILABLE', 'MCP_ENDPOINT', 'MCP_REDIRECT', 'MCP_OAUTH_DESTINATION',
  'MCP_TOO_MANY_TOOLS', 'MCP_CATALOG_SIZE', 'MCP_SCHEMA', 'MCP_SCHEMA_PATTERN', 'MCP_SIZE', 'MCP_TOOL',
  'MCP_OAUTH_SIZE', 'MCP_OAUTH_RESOURCE', 'MCP_OAUTH_ISSUER', 'MCP_OAUTH_METADATA',
  'MCP_OAUTH_PKCE', 'MCP_OAUTH_SCOPE', 'MCP_OAUTH_CLIENT', 'MCP_OAUTH_STATIC_ISSUER',
  'MCP_OAUTH_ISSUER_REQUIRED', 'MCP_OAUTH_NETWORK']);
export function safeFailureCode(failure: unknown) {
  return failure instanceof Error && knownCodes.has(failure.message) ? failure.message : 'MCP_CONNECTION';
}
export class OAuthSetupFailure extends Error {
  readonly code: string;
  readonly dns: DnsDiagnostic[] | undefined;
  constructor(readonly stage: SetupStage, failure: unknown) {
    super(setupMessages[stage]);
    this.code = safeFailureCode(failure);
    this.dns = failure instanceof DnsFailure ? failure.diagnostics : undefined;
  }
}
export async function oauthStage<T>(stage: SetupStage, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (failure) { throw new OAuthSetupFailure(stage, failure); }
}
