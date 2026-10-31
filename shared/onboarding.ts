export const avatarStyles = [
  { code: 'cartoon', name: 'Cartoon' }, { code: 'anime', name: 'Anime' },
  { code: '3d', name: '3D animated movie' }, { code: 'realistic', name: 'Realistic people' },
] as const;
const regions = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const languages = 'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');
export type OnboardingOption = { code: string; name: string };
function labels(codes: string[], type: 'region' | 'language'): OnboardingOption[] {
  const names = new Intl.DisplayNames(['en'], { type });
  return codes.map(code => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
export const onboardingOptions = { countries: labels(regions, 'region'), languages: labels(languages, 'language'), styles: avatarStyles };
export const circleTypes = [
  { code: 'friends', name: 'Friends' }, { code: 'study', name: 'Study' }, { code: 'work', name: 'Work' },
] as const;
export type OnboardingInput = { name: string; age?: number | null; gender: 'male' | 'female'; language: string; country: string;
  style: typeof avatarStyles[number]['code']; createGroup?: boolean; circleType?: typeof circleTypes[number]['code'];
  occupation?: string; sharedMemoryConsent: boolean;
  /** false skips AI contacts entirely; absent (older clients) means true. */
  createContacts?: boolean };
export type OnboardingStatus = { status: 'pending' | 'queued' | 'generating' | 'failed' | 'complete';
  photoCount: number; groupID: string | null; input: OnboardingInput | null };
export function parseOnboarding(value: unknown): OnboardingInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).filter(key => key !== 'createContacts').sort().join(',');
  if ('createContacts' in v && typeof v.createContacts !== 'boolean') return null;
  const createContacts = v.createContacts !== false;
  const legacy = keys === 'age,country,gender,language,name,sharedMemoryConsent,style';
  if ((!legacy && keys !== 'age,circleType,country,createGroup,gender,language,name,occupation,sharedMemoryConsent,style')
    || (!legacy && (typeof v.createGroup !== 'boolean' || !circleTypes.some(t => t.code === v.circleType)
      || typeof v.occupation !== 'string' || [...v.occupation.trim()].length > 200
      || /[\u0000-\u001f\u007f-\u009f]/u.test(v.occupation)
      || (createContacts && v.circleType !== 'friends' && !v.occupation.trim())))
    || typeof v.age !== 'number' || !Number.isInteger(v.age) || v.age < 1 || v.age > 120
    || typeof v.name !== 'string' || !v.name.trim() || [...v.name.trim()].length > 100
    || /[\u0000-\u001f\u007f-\u009f]/u.test(v.name) || !['male', 'female'].includes(String(v.gender))
    || !regions.includes(String(v.country)) || !languages.includes(String(v.language))
    || !avatarStyles.some(s => s.code === v.style) || (createContacts && v.sharedMemoryConsent !== true)) return null;
  return { name: v.name.trim(), age: v.age, gender: v.gender as OnboardingInput['gender'], country: String(v.country),
    language: String(v.language), style: v.style as OnboardingInput['style'], createGroup: legacy ? true : v.createGroup as boolean,
    circleType: legacy ? 'friends' : v.circleType as OnboardingInput['circleType'],
    occupation: legacy || v.circleType === 'friends' ? '' : (v.occupation as string).trim(), sharedMemoryConsent: v.sharedMemoryConsent === true,
    createContacts };
}
