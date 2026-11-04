// Built-in copy of the shared components (close buttons, the select search, the
// default loading label, the password show/hide button). The layer ships English
// and stays free of an i18n dependency; an app with its own localization
// (apps/web) replaces these strings whenever its locale changes, and apps
// without one (apps/admin) keep English.
// See docs/localization.md.
export type UiStrings = {
  loading: string;
  dismiss: string;
  clearSearch: string;
  close: string;
  search: string;
  noMatches: string;
  showPassword: string;
  hidePassword: string;
};

export const defaultUiStrings: UiStrings = {
  loading: 'Loading…',
  dismiss: 'Dismiss',
  clearSearch: 'Clear search',
  close: 'Close',
  search: 'Search',
  noMatches: 'No matches',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
};

export function useUiStrings() {
  return useState<UiStrings>('ui-strings', () => ({ ...defaultUiStrings }));
}
