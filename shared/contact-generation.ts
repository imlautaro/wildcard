import { onboardingOptions, parseCustomStyle, type OnboardingInput } from './onboarding';
// One Create contact form (docs/contact-generation.md): the personality is always generated;
// an empty name is generated, and the photo is generated, uploaded with the request or omitted.
export type ContactPhotoSource = 'generate' | 'upload' | 'none';
export type ContactGenerationInput = Pick<OnboardingInput, 'style' | 'customStyle' | 'gender' | 'language' | 'country'> & {
  age: number; purpose: 'friends' | 'study' | 'work';
  /** Chosen name; omitted to generate one. */
  name?: string;
  /** Omitted by older clients, which always generate a portrait. */
  photo?: ContactPhotoSource;
};
export type ContactGenerationJob = { id: string; status: 'queued' | 'generating' | 'failed' | 'complete'; contactID: string | null; input: ContactGenerationInput };
export const contactPhotoSources: readonly ContactPhotoSource[] = ['generate', 'upload', 'none'];
export function parseContactName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && [...name].length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/u.test(name) ? name : null;
}
export function parseContactGeneration(value: unknown): ContactGenerationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const customStyle = v.style === 'custom' ? parseCustomStyle(v.customStyle) : null;
  if (v.style === 'custom' && !customStyle) return null;
  const name = v.name === undefined ? null : parseContactName(v.name);
  if (v.name !== undefined && !name) return null;
  if (v.photo !== undefined && !contactPhotoSources.includes(v.photo as ContactPhotoSource)) return null;
  if (Object.keys(v).filter(key => !['customStyle', 'name', 'photo'].includes(key)).sort().join(',') !== 'age,country,gender,language,purpose,style'
    || !Number.isInteger(v.age) || Number(v.age) < 18 || Number(v.age) > 120
    || !['male', 'female'].includes(String(v.gender)) || !['friends', 'study', 'work'].includes(String(v.purpose))
    || !onboardingOptions.styles.some(o => o.code === v.style)
    || !onboardingOptions.languages.some(o => o.code === v.language)
    || !onboardingOptions.countries.some(o => o.code === v.country)) return null;
  const { customStyle: _ignored, name: _name, photo: _photo, ...input } = v;
  return { ...input, ...(customStyle ? { customStyle } : {}), ...(name ? { name } : {}),
    photo: (v.photo as ContactPhotoSource | undefined) ?? 'generate' } as ContactGenerationInput;
}
