import type { Personality } from '../../../../shared/personality';

export type InitiativeKind = 'continuation' | 'greeting' | 'check-in';
export type Engagement = 'social' | 'practical' | 'boundary' | 'uncertain';
export type OutreachResponse = 'engaged' | 'unrelated' | 'uncertain' | 'none';
export type InitiativeSample = {
  id: string; sequence: number; createdAt: number; repliedAt: number; timeZone: string | null;
  human: number; proactive: number; kind: InitiativeKind | null;
  engagement: Engagement | null; response: OutreachResponse | null; responseTo: string | null;
  replyToID: string | null; replyToSide: string | null;
};
const hour = 3_600_000;
export const adaptiveHorizon = 7 * 24 * hour;

export async function readInitiativeSamples(db: D1Database, contactID: string, userID: string, now: number, sourceID: string) {
  return (await db.prepare(`SELECT id, sequence, created_at AS createdAt, updated_at AS repliedAt, time_zone AS timeZone,
    (initiative_source_id IS NULL AND schedule_id IS NULL AND task_id IS NULL AND group_request_id IS NULL
      AND origin_group_id IS NULL AND (user_text != '' OR attachment_json IS NOT NULL)) AS human,
    (initiative_source_id IS NOT NULL) AS proactive, initiative_kind AS kind,
    initiative_engagement AS engagement, initiative_response AS response, initiative_response_to_id AS responseTo,
    reply_to_id AS replyToID, reply_to_side AS replyToSide
    FROM chat_turn WHERE contact_id = ? AND user_id = ? AND status = 'complete'
      AND (created_at >= ? OR id = ?) ORDER BY sequence DESC LIMIT 160`)
    .bind(contactID, userID, now - 28 * 24 * hour, sourceID).all<InitiativeSample>()).results;
}

// The feedback describes the first completed human request after an outreach,
// never an arbitrary later task that happened to be sent to this contact.
export function outreachBefore(samples: InitiativeSample[], sourceID: string): InitiativeSample | null {
  const source = samples.find(s => s.id === sourceID);
  if (!source) return null;
  if (source.replyToID) return source.replyToSide === 'assistant'
    ? samples.find(s => s.id === source.replyToID && s.proactive && s.repliedAt <= source.createdAt) ?? null : null;
  for (const sample of samples.filter(s => s.sequence < source.sequence)) {
    if (sample.human) return null;
    if (sample.proactive) return sample.repliedAt <= source.createdAt ? sample : null;
  }
  return null;
}

function seededFraction(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export function variedReviewDelay(seconds: number, seed: string) {
  return Math.ceil(seconds * (1.05 + seededFraction(seed) * 0.25));
}

// Re-engagement episodes may follow earlier unanswered outreach, up to this many
// spontaneous messages since the person last wrote. Then outreach waits for them.
export const reengagementCap = 3;
// An ignored greeting suppresses greetings for this long, not forever.
const greetingSuppression = 24 * hour;
// Quiet time before each re-engagement, by spontaneous messages already unanswered
// since the person last wrote. Contacts start eager; adaptation slows them down.
export const reengagementQuiet = [3 * hour, 12 * hour, 48 * hour];
// The smallest multiplier reengagementFactor can return, for SQL prefiltering.
export const minimumReengagementFactor = 0.75;

// Eager by default: unmeasured receptivity uses the base cadence. Measured engagement
// keeps it; ignored outreach stretches it. A very proactive character is faster.
export function reengagementFactor(policy: { responseRate: number | null }, p: Personality) {
  const initiative = p.enabled ? p.traits.initiative : 5;
  const character = initiative >= 8 ? minimumReengagementFactor : initiative <= 3 ? 1.5 : 1;
  const rate = policy.responseRate;
  const receptivity = rate === null || rate >= 0.6 ? 1 : rate >= 0.35 ? 2 : 4;
  return character * receptivity;
}

export function adaptivePolicy(samples: InitiativeSample[], sourceID: string, p: Personality, now: number, paused: boolean, reengage = false) {
  const humans = samples.filter(s => s.human);
  const source = humans.find(s => s.id === sourceID);
  const outreach = samples.filter(s => s.proactive);
  // Without any human message (a new contact's welcome), every outreach is unanswered.
  const latestHumanAt = humans[0]?.createdAt ?? 0;
  const unanswered = outreach.filter(s => s.repliedAt >= latestHumanAt).length;
  const lastSocial = humans.find(s => s.engagement === 'social' && s.response !== 'unrelated');
  const recentStyles = humans.filter(s => s.engagement && s.engagement !== 'uncertain').slice(0, 2);
  const taskOnly = recentStyles.length >= 2 && recentStyles.every(s => s.engagement === 'practical');
  // Only a recent ignored greeting suppresses greetings; older silence is not a lasting refusal.
  const ignoredGreeting = outreach.find(s => s.kind === 'greeting' && now - s.repliedAt < greetingSuppression
    && (!lastSocial || lastSocial.createdAt < s.repliedAt)
    && !humans.some(h => h.responseTo === s.id && h.response === 'engaged'));
  const boundary = source?.engagement === 'boundary';
  const outcomes = outreach.slice(0, 20).flatMap(s => {
    const response = humans.find(h => h.responseTo === s.id);
    if (response?.response === 'engaged') return [1];
    if (response?.response === 'unrelated' || (!response && now - s.repliedAt >= 24 * hour)) return [0];
    return [];
  });
  const responseRate = outcomes.length >= 3 ? outcomes.reduce((a, b) => a + b, 0) / outcomes.length : null;
  const initiative = p.enabled ? p.traits.initiative : 5;
  const patience = p.enabled ? p.traits.patience : 5;
  // Eager until measured: unknown receptivity allows the global ceiling of three
  // unanswered continuations; ignored outreach, task-only use or a reserved
  // character lowers it.
  const maxUnanswered = paused || boundary ? 0
    : taskOnly || (responseRate !== null && responseRate < 0.35) ? 1
    : initiative <= 3 || (responseRate !== null && responseRate < 0.65) || patience >= 8 ? 2 : 3;
  const greetingsAllowed = !paused && !boundary && !taskOnly && !ignoredGreeting;
  return {
    paused, taskOnly, unanswered, maxUnanswered, greetingsAllowed, reengage,
    // A new conversation no longer needs a prior social classification: unknown is not
    // refusal. Task-only chats may receive task-related follow-ups, never greetings.
    // Ordinary ambient outreach still needs every earlier one answered; re-engagement
    // after silence may follow up to the cap.
    ambientAllowed: !paused && !boundary && unanswered < (reengage ? reengagementCap : 1),
    responseRate, measuredOutcomes: outcomes.length,
    minimumAmbientGapHours: 1 + (10 - initiative) * 0.35 + patience * 0.1
      + (responseRate !== null && responseRate < 0.5 ? 6 : 0),
  };
}
export type AdaptivePolicy = ReturnType<typeof adaptivePolicy>;

// All statistics are request-local and use only this conversation. Deduplicate
// civil day/hour buckets so a burst of short messages cannot dominate the fit.
export function activityWindows(samples: InitiativeSample[], timeZone: string | null, now: number) {
  const weights = Array<number>(24).fill(0);
  const days = new Set<string>(), buckets = new Set<string>();
  if (!timeZone) return { learned: false, weights };
  try {
    const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' });
    for (const sample of samples) {
      if (!sample.human || sample.timeZone !== timeZone || now - sample.createdAt > 28 * 24 * hour) continue;
      const parts = format.formatToParts(sample.createdAt);
      const part = (type: string) => parts.find(p => p.type === type)?.value;
      const day = `${part('year')}-${part('month')}-${part('day')}`;
      const localHour = Number(part('hour'));
      const key = `${day}/${localHour}`;
      if (buckets.has(key)) continue;
      buckets.add(key); days.add(day);
      const weight = Math.exp(-Math.max(0, now - sample.createdAt) / (14 * 24 * hour))
        * (sample.response === 'engaged' ? 3 : sample.engagement === 'practical' ? 0.5 : 1);
      weights[localHour]! += weight;
      weights[(localHour + 23) % 24]! += weight * 0.35;
      weights[(localHour + 1) % 24]! += weight * 0.35;
    }
    return { learned: days.size >= 3, weights };
  } catch { return { learned: false, weights: Array<number>(24).fill(0) }; }
}

// A stable draw is checkpoint/retry-safe, but changes by source, revision and
// opportunity. These are approximate windows, never a recurring clock schedule.
export function nextAmbientOpportunity(input: {
  samples: InitiativeSample[]; timeZone: string | null; policy: AdaptivePolicy;
  earliest: number; expiresAt: number; seed: string;
}): number | null {
  if (!input.policy.ambientAllowed || !input.timeZone) return null;
  try {
    const format = new Intl.DateTimeFormat('en', { timeZone: input.timeZone, hour: 'numeric', hourCycle: 'h23' });
    const windows = activityWindows(input.samples, input.timeZone, input.earliest);
    const maxWeight = Math.max(1, ...windows.weights);
    const jitter = (7 + seededFraction(`${input.seed}/minute`) * 47) * 60_000;
    const candidates: { at: number; weight: number }[] = [];
    for (let at = input.earliest + jitter; at < Math.min(input.expiresAt, input.earliest + 48 * hour); at += 30 * 60_000) {
      const localHour = Number(format.format(at));
      if (localHour < 8 || localHour >= 22) continue;
      const preference = windows.learned ? 0.02 + windows.weights[localHour]! / maxWeight : 1;
      candidates.push({ at, weight: preference * Math.exp(-(at - input.earliest) / (8 * hour)) });
    }
    let draw = seededFraction(`${input.seed}/window`) * candidates.reduce((total, candidate) => total + candidate.weight, 0);
    for (const candidate of candidates) {
      draw -= candidate.weight;
      if (draw <= 0) return Math.floor(candidate.at);
    }
    return null;
  } catch { return null; }
}

export function projectedFeedback(samples: InitiativeSample[], sourceID: string, engagement: Engagement, response: OutreachResponse) {
  const previous = outreachBefore(samples, sourceID);
  return samples.map(s => s.id === sourceID && s.engagement === null ? {
    ...s, engagement, response: previous ? response : 'none' as const, responseTo: previous?.id ?? null,
  } : s);
}
