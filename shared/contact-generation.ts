import { onboardingOptions, type OnboardingInput } from './onboarding';
export type ContactGenerationInput = Pick<OnboardingInput, 'style' | 'gender' | 'language' | 'country'> & {
  age: number; purpose: 'friends' | 'study' | 'work';
};
export type ContactGenerationJob = { id: string; status: 'queued' | 'generating' | 'failed' | 'complete'; contactID: string | null; input: ContactGenerationInput };
export function parseContactGeneration(value: unknown): ContactGenerationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'age,country,gender,language,purpose,style'
    || !Number.isInteger(v.age) || Number(v.age) < 18 || Number(v.age) > 120
    || !['male', 'female'].includes(String(v.gender)) || !['friends', 'study', 'work'].includes(String(v.purpose))
    || !onboardingOptions.styles.some(o => o.code === v.style)
    || !onboardingOptions.languages.some(o => o.code === v.language)
    || !onboardingOptions.countries.some(o => o.code === v.country)) return null;
  return v as ContactGenerationInput;
}
