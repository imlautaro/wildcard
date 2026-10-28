import MarkdownIt from 'markdown-it';

// Only this configured renderer may produce markup for v-html. Raw HTML is escaped,
// and remote Markdown images render as labels without requesting external bytes.
const parser = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
const defaultValidateLink = parser.validateLink.bind(parser);
parser.validateLink = (href) => /^(https?:\/\/|mailto:)/i.test(href) && defaultValidateLink(href);
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index]?.content ?? '');
parser.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index]?.attrSet('rel', 'noreferrer noopener');
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
