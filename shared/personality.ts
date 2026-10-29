// Versioned product controls, not a psychological assessment or diagnosis.
export const personalityTraits = [
  { key: 'energy', label: 'Energy', low: 'Calm', high: 'Energetic' },
  { key: 'patience', label: 'Patience', low: 'Restless', high: 'Patient' },
  { key: 'sensitivity', label: 'Sensitivity', low: 'Thick-skinned', high: 'Sensitive' },
  { key: 'expressiveness', label: 'Expression', low: 'Restrained', high: 'Expressive' },
  { key: 'playfulness', label: 'Humor', low: 'Serious', high: 'Playful' },
  { key: 'warmth', label: 'Warmth', low: 'Reserved', high: 'Affectionate' },
  { key: 'assertiveness', label: 'Assertiveness', low: 'Accommodating', high: 'Direct' },
  { key: 'curiosity', label: 'Curiosity', low: 'Focused', high: 'Exploratory' },
  { key: 'optimism', label: 'Outlook', low: 'Skeptical', high: 'Optimistic' },
  { key: 'formality', label: 'Formality', low: 'Casual', high: 'Formal' },
  { key: 'verbosity', label: 'Detail', low: 'Concise', high: 'Expansive' },
  { key: 'volatility', label: 'Temper', low: 'Even-tempered', high: 'Quick-tempered' },
  { key: 'resilience', label: 'Recovery', low: 'Slow to settle', high: 'Quick to settle' },
  { key: 'initiative', label: 'Initiative', low: 'Waits for you', high: 'Starts conversations' },
  { key: 'sarcasm', label: 'Irony', low: 'Literal', high: 'Wry' },
] as const;
export type TraitKey = typeof personalityTraits[number]['key'];
export type Personality = {
  enabled: boolean;
  description: string;
  specialties: string;
  birthDate: string | null;
  timeZone: string;
  traits: Record<TraitKey, number>;
};
export type PersonalitySnapshot = { personality: Personality; revision: number; age: number | null; isBirthday: boolean };
export function defaultPersonality(): Personality {
  return { enabled: false, description: '', specialties: '', birthDate: null, timeZone: 'UTC',
    traits: Object.fromEntries(personalityTraits.map(t => [t.key, 5])) as Record<TraitKey, number> };
}

export function localDate(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function birthdayFacts(profile: Personality, at: number) {
  if (!profile.birthDate) return { age: null, isBirthday: false };
  const today = localDate(at, profile.timeZone);
  const year = Number(today.slice(0, 4));
  // February 29 is observed on February 28 in non-leap years, including aging.
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  const anniversary = profile.birthDate.slice(5) === '02-29' && !leap ? '02-28' : profile.birthDate.slice(5);
  return { age: year - Number(profile.birthDate.slice(0, 4)) - (today.slice(5) < anniversary ? 1 : 0),
    isBirthday: today.slice(5) === anniversary };
}

export function parsePersonality(value: unknown, now = Date.now()): Personality | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const keys = Object.keys(p).filter(key => key !== 'specialties').sort().join(',');
  const specialties = p.specialties === undefined ? '' : p.specialties;
  if (keys !== 'birthDate,description,enabled,timeZone,traits'
    || typeof specialties !== 'string' || [...specialties].length > 1000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(specialties)
    || typeof p.enabled !== 'boolean' || typeof p.description !== 'string' || [...p.description].length > 2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(p.description)
    || typeof p.timeZone !== 'string' || p.timeZone.length > 100 || /^[+-]/.test(p.timeZone)
    || !p.traits || typeof p.traits !== 'object' || Array.isArray(p.traits)) return null;
  try { localDate(now, p.timeZone); } catch { return null; }
  if (p.birthDate !== null) {
    if (typeof p.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) return null;
    const date = new Date(`${p.birthDate}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== p.birthDate
      || p.birthDate < '1900-01-01' || p.birthDate > localDate(now, p.timeZone)) return null;
  }
  const traits = p.traits as Record<string, unknown>;
  if (Object.keys(traits).length !== personalityTraits.length || personalityTraits.some(t =>
    typeof traits[t.key] !== 'number' || !Number.isInteger(traits[t.key]) || Number(traits[t.key]) < 1 || Number(traits[t.key]) > 10)) return null;
  return { enabled: p.enabled, description: p.description.trim(), specialties: specialties.trim(), birthDate: p.birthDate as string | null,
    timeZone: p.timeZone, traits: { ...traits } as Record<TraitKey, number> };
}
