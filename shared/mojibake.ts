// Repairs UTF-8 text that was decoded as Windows-1252/Latin-1 somewhere upstream
// ("mojibake"): an emoji such as 😀 (F0 9F 98 80) shows up as "ðŸ˜€", a curly
// apostrophe as "â€™" and "é" as "Ã©". Model output sometimes contains these
// sequences (docs/chats.md#garbled-characters). Only sequences that decode to a
// plausible character are rewritten, so ordinary accented text is left alone; an
// emoji fragment whose bytes were lost ("ðŸ" followed by text) is removed, as is a
// lone "ð" (an emoji's first byte) standing apart from any word, and stray C1 controls.

// Windows-1252 characters for bytes 0x80–0x9F; the five undefined bytes decode as C1 controls.
const cp1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function byteOf(char: string): number | null {
  const code = char.codePointAt(0)!;
  if (code >= 0x80 && code <= 0xff) return code;
  return cp1252[code] ?? null;
}

const continuation = (byte: number | null): byte is number => byte !== null && byte >= 0x80 && byte <= 0xbf;

// Characters these mistakes produce in practice: Latin-1 accents (Ã/Â), punctuation,
// arrows and symbols (â€), variation selectors (ï¸), CJK punctuation and emoji (ðŸ).
function plausible(codePoint: number, length: number): boolean {
  if (length === 2) return codePoint >= 0x80 && codePoint <= 0xff;
  if (length === 3) return (codePoint >= 0x2000 && codePoint <= 0x2bff) || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0x3000 && codePoint <= 0x303f);
  return codePoint >= 0x1f000 && codePoint <= 0x1faff;
}

// Two-byte prefixes of the plausible ranges above, used to drop truncated fragments.
const fragmentPrefixes = new Set(['f0:9f', 'e2:80', 'ef:b8']);

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const signature = /[ÂÃâðï][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/u;

// A lone emoji lead byte: "ð" not touching a letter, digit or mark (real "ð" sits inside words).
const loneLead = /(?<![\p{L}\p{N}\p{M}])ð(?![\p{L}\p{N}\p{M}])/gu;
const c1Controls = /[\u0080-\u009f]/gu;

// JSON-mode answers sometimes escape the garbled bytes ("\u00f0\u009f\u0098\u0080"), which
// the repair cannot see until the JSON is parsed. Latin-1 escapes never need escaping in
// JSON, so writing them literally (when their backslash is not itself escaped) keeps the
// JSON equivalent and lets repairMojibake run on it.
export function unescapeLatin1(json: string): string {
  return json.replace(/(?<!\\)((?:\\\\)*)\\u00([89a-f][0-9a-f])/giu,
    (_, slashes: string, hex: string) => slashes + String.fromCharCode(parseInt(hex, 16)));
}

export function repairMojibake(text: string): string {
  if (!signature.test(text)) return /[ð\u0080-\u009f]/u.test(text) ? cleanup(text) : text;
  const chars = Array.from(text);
  let output = '';
  for (let i = 0; i < chars.length;) {
    const lead = byteOf(chars[i]!);
    const length = lead === null ? 0 : lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
    if (!length) { output += chars[i]; i++; continue; }
    const bytes = [lead!];
    while (bytes.length < length && continuation(byteOf(chars[i + bytes.length] ?? ''))) bytes.push(byteOf(chars[i + bytes.length]!)!);
    if (bytes.length === length) {
      try {
        const decoded = decoder.decode(new Uint8Array(bytes));
        if (plausible(decoded.codePointAt(0)!, length)) { output += decoded; i += length; continue; }
      } catch { /* Not UTF-8: keep the original characters. */ }
    } else if (bytes.length >= 2 && fragmentPrefixes.has(`${bytes[0]!.toString(16)}:${bytes[1]!.toString(16)}`)) {
      // The rest of the character was lost; drop the fragment rather than show it.
      i += bytes.length;
      continue;
    }
    output += chars[i];
    i++;
  }
  return cleanup(output);
}

function cleanup(text: string): string {
  // A space-separated lead byte takes its leading space with it ("genial ð" → "genial").
  return text.replace(/ ð(?=\s|$)/gu, '').replace(loneLead, '').replace(c1Controls, '');
}
