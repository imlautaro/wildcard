// Explicit speech preferences, independent of nationality or the listener's locale.
// These are best-effort v4 delivery directions, not guaranteed provider capabilities.
export const speechAccents = [
  { code: 'AR', name: 'Argentine', direction: 'Argentine accent' },
  { code: 'UY', name: 'Uruguayan', direction: 'Uruguayan accent' },
  { code: 'MX', name: 'Mexican', direction: 'Mexican accent' },
  { code: 'ES', name: 'Spanish (Spain)', direction: 'Spanish accent' },
  { code: 'CL', name: 'Chilean', direction: 'Chilean accent' },
  { code: 'CO', name: 'Colombian', direction: 'Colombian accent' },
  { code: 'PE', name: 'Peruvian', direction: 'Peruvian accent' },
  { code: 'VE', name: 'Venezuelan', direction: 'Venezuelan accent' },
  { code: 'US', name: 'American', direction: 'American accent' },
  { code: 'GB', name: 'British', direction: 'British accent' },
  { code: 'AU', name: 'Australian', direction: 'Australian accent' },
  { code: 'IE', name: 'Irish', direction: 'Irish accent' },
  { code: 'BR', name: 'Brazilian', direction: 'Brazilian accent' },
  { code: 'PT', name: 'Portuguese (Portugal)', direction: 'European Portuguese accent' },
  { code: 'FR', name: 'French', direction: 'French accent' },
  { code: 'IT', name: 'Italian', direction: 'Italian accent' },
  { code: 'DE', name: 'German', direction: 'German accent' },
] as const;
export type SpeechAccent = typeof speechAccents[number]['code'];
export const speechAccent = (value: unknown) => speechAccents.find(option => option.code === value);
export const accentForCountry = (country: string): SpeechAccent | null => speechAccent(country)?.code ?? null;
