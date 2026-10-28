import { isRecord } from '../chat/meta';
import type { Connection } from './client';
import { DnsFailure } from './errors';
import { isIP } from 'node:net';

export const encoder = new TextEncoder();
export function size(value: unknown) { return encoder.encode(JSON.stringify(value)).length; }
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function endpoint(value: string): URL {
  const url = new URL(value);
  // No URL credentials, fragments, query secrets, IP literals, local names or custom ports.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.search || value.length > 2048 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) ||
    /\.(localhost|local|internal|test|invalid|example|onion)$/.test(url.hostname)) throw new Error('MCP_ENDPOINT');
  return url;
}
async function key(env: Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('MCP_KEY');
  const material = await crypto.subtle.importKey('raw', encoder.encode(env.BETTER_AUTH_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('wildcard/mcp/v1'), info: encoder.encode('credentials') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function credential(env: Env, connection: Pick<Connection, 'id' | 'userID' | 'credentialScope'>, value: string, decrypt = false): Promise<string> {
  const aad = encoder.encode(JSON.stringify([connection.id, connection.userID, connection.credentialScope]));
  if (decrypt) {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: aad }, await key(env), bytes.slice(12)));
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key(env), encoder.encode(value)));
  const bytes = new Uint8Array(iv.length + encrypted.length); bytes.set(iv); bytes.set(encrypted, iv.length);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16384) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  return btoa(chunks.join(''));
}

function publicAddress(address: string): boolean {
  if (isIP(address) === 0) return false;
  if (address.includes(':')) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:0:|db8:)/i.test(address);
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return a !== 0 && a !== 10 && a !== 127 && a! >= 1 && a! < 224 &&
    !(a === 169 && b === 254) && !(a === 172 && b! >= 16 && b! <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || b === 2)) && !(a === 100 && b! >= 64 && b! <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0);
}
// Workers supports manual redirect handling, but rejects redirect: 'error' before I/O.
export async function rejectRedirect(response: Response): Promise<void> {
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('MCP_REDIRECT');
  }
}
async function dnsQuery(host: string, type: 'A' | 'AAAA', signal: AbortSignal): Promise<string[]> {
  const fail = (reason: DnsFailure['diagnostics'][number]['reason'], httpStatus?: number) => new DnsFailure(
    ['private_address', 'no_addresses', 'not_found'].includes(reason) ? 'MCP_DNS' : 'MCP_DNS_UNAVAILABLE',
    [{ resolver: 'cloudflare', type, reason, ...(httpStatus ? { httpStatus } : {}) }]);
  try {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', host); url.searchParams.set('type', type);
    const response = await fetch(url, { headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal });
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); throw fail('http', response.status); }
    const reader = response.body.getReader();
    let bytes = 0, text = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 16000) throw fail('invalid_response');
        text += decoder.decode(part.value, { stream: true });
      }
      let data: unknown;
      try { data = JSON.parse(text + decoder.decode()); } catch { throw fail('invalid_response'); }
      if (!isRecord(data) || !Number.isInteger(data.Status) || data.TC === true) throw fail('invalid_response');
      if (data.Status === 3) throw fail('not_found');
      if (data.Status !== 0) throw fail('resolver_failure');
      const question = Array.isArray(data.Question) && data.Question.length === 1 ? data.Question[0] : null;
      if (!isRecord(question) || typeof question.name !== 'string' || question.name.toLowerCase().replace(/\.$/, '') !== host.toLowerCase() ||
        question.type !== (type === 'A' ? 1 : 28) || (data.Answer !== undefined && !Array.isArray(data.Answer))) throw fail('invalid_response');
      const addresses = (Array.isArray(data.Answer) ? data.Answer : []).filter(v => isRecord(v) && [1, 28].includes(Number(v.type))).map(v => String(v.data));
      if (addresses.some(address => !publicAddress(address))) throw fail('private_address');
      return addresses;
    } finally { await reader.cancel().catch(() => undefined); }
  } catch (failure) {
    if (failure instanceof DnsFailure) throw failure;
    throw fail(signal.aborted ? 'timeout' : 'network');
  }
}
export async function checkPublicDNS(host: string, signal: AbortSignal) {
  // Wait for both families so an availability failure cannot mask a private address.
  const results = await Promise.allSettled([dnsQuery(host, 'A', signal), dnsQuery(host, 'AAAA', signal)]);
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason as DnsFailure);
  if (failures.length) {
    throw new DnsFailure(failures.some(failure => failure.message === 'MCP_DNS') ? 'MCP_DNS' : 'MCP_DNS_UNAVAILABLE',
      failures.flatMap(failure => failure.diagnostics));
  }
  if (!results.some(result => result.status === 'fulfilled' && result.value.length)) {
    throw new DnsFailure('MCP_DNS', [{ resolver: 'cloudflare', reason: 'no_addresses' }]);
  }
}
