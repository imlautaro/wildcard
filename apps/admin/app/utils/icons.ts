// Material Symbols (Rounded), outline and filled, as in apps/web. nuxt.config.ts
// bundles exactly these icons into the client, so a new icon only needs an entry.
export const appIcons = {
  dashboard: ['material-symbols:dashboard-outline-rounded', 'material-symbols:dashboard-rounded'],
  people: ['material-symbols:group-outline-rounded', 'material-symbols:group-rounded'],
  flag: ['material-symbols:flag-outline-rounded', 'material-symbols:flag-rounded'],
  logout: ['material-symbols:logout-rounded', 'material-symbols:logout-rounded'],
  search: ['material-symbols:search-rounded', 'material-symbols:search-rounded'],
  close: ['material-symbols:close-rounded', 'material-symbols:close-rounded'],
  delete: ['material-symbols:delete-outline-rounded', 'material-symbols:delete-rounded'],
  refresh: ['material-symbols:refresh-rounded', 'material-symbols:refresh-rounded'],
  shield: ['material-symbols:shield-person-outline-rounded', 'material-symbols:shield-person-rounded'],
  copy: ['material-symbols:content-copy-outline-rounded', 'material-symbols:content-copy-rounded'],
  history: ['material-symbols:history-rounded', 'material-symbols:history-rounded'],
} as const satisfies Record<string, readonly [outline: string, filled: string]>;

export type AppIconName = keyof typeof appIcons;
