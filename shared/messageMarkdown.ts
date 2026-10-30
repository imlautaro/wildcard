import MarkdownIt from 'markdown-it';

// Only this configured renderer may produce markup for v-html. Raw HTML is escaped,
// and remote Markdown images render as labels without requesting external bytes.
// Bare URLs become links only with a scheme or www. ("notes.md" stays text);
// plain email addresses become mailto links, as on iOS.
const parser = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });
parser.linkify.set({ fuzzyLink: true, fuzzyEmail: true });
const explicitLink = (raw: string) => /^(https?:\/\/|mailto:|www\.)/i.test(raw) || /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(raw);
parser.core.ruler.after('linkify', 'explicit_linkify', (state) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const kept: typeof block.children = [];
    for (let index = 0; index < block.children.length; index++) {
      const token = block.children[index]!;
      const label = block.children[index + 1];
      // Unwrap a fuzzy autolink (open, text, close) into its literal text.
      if (token.type === 'link_open' && token.markup === 'linkify' && label && !explicitLink(label.content)) {
        kept.push(label);
        index += 2;
        continue;
      }
      kept.push(token);
    }
    block.children = kept;
  }
});
const defaultValidateLink = parser.validateLink.bind(parser);
parser.validateLink = (href) => /^(https?:\/\/|mailto:)/i.test(href) && defaultValidateLink(href);
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index]?.content ?? '');
parser.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index]?.attrSet('rel', 'noreferrer noopener');
  tokens[index]?.attrSet('target', '_blank');
  return renderer.renderToken(tokens, index, options);
};

export function renderMessageMarkdown(text: string): string {
  return parser.render(text);
}

// Walk parser tokens, never rendered HTML: links/images contribute their labels,
// code contributes literal content, and block boundaries contribute whitespace.
export function plainMessageMarkdown(source: string): string {
  type Token = ReturnType<typeof parser.parse>[number];
  const text = (tokens: Token[]): string => tokens.map((token): string => {
    if (token.children) return text(token.children);
    if (['text', 'code_inline', 'code_block', 'fence', 'image'].includes(token.type)) return token.content + (token.block ? '\n' : '');
    if (['softbreak', 'hardbreak', 'hr', 'td_close', 'th_close'].includes(token.type)) return '\n';
    return token.block && token.nesting !== 1 ? '\n' : '';
  }).join('');
  return text(parser.parse(source, {})).replace(/\s+/gu, ' ').trim();
}

export type TextSegment = { text: string; url?: string };

// Literal text (human messages) split into plain and link segments with the
// same detection and scheme rules as bot Markdown. Never produces markup.
export function linkSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of parser.linkify.match(text) ?? []) {
    if (!explicitLink(match.raw) || !/^(https?:\/\/|mailto:)/i.test(match.url)) continue;
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ text: match.raw, url: match.url });
    last = match.lastIndex;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
