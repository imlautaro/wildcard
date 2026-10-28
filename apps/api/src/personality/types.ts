import type { Personality } from '../../../../shared/personality';

export type PersonID = `user:${string}` | `agent:${string}`;
export type Person = { id: PersonID; name: string };
export type Kind = 'neutral' | 'affection' | 'celebration' | 'conflict' | 'repair' | 'distress' | 'boundary' | 'birthday';
export type Topic = 'ordinary' | 'playful' | 'serious' | 'practical';
export type Engagement = 'self' | 'group' | 'other' | 'uncertain';
export type Appraisal = {
  version: 2;
  kind: Kind;
  topic: Topic;
  engagement: Engagement;
  confidence: number;
  replyTargets: PersonID[];
  // Server-derived, bounded temporary reaction. No motive, transcript or date.
  disappointment: number;
  complete: boolean;
};
export type Observation = { sourceID: string; speakerID: PersonID; appraisal: string; createdAt: number };
export type RelationshipObservation = { speakerID: PersonID; appraisal: string; createdAt: number };
export type PersonalityScope = {
  agentID: string;
  contactID?: string;
  groupID?: string;
  speakerID: PersonID;
  processingUserID: string;
  sourceID?: string;
  attempt?: number;
  text?: string;
  context?: string;
  model?: string;
  silence?: { repliedAt: number; readAt: number | null };
};
export type RelationshipState = { tension: number; warmth: number; trust: number; delight: number };
export const day = 86_400_000;
export const kinds: Kind[] = ['neutral', 'affection', 'celebration', 'conflict', 'repair', 'distress', 'boundary', 'birthday'];
export const topics: Topic[] = ['ordinary', 'playful', 'serious', 'practical'];
export function neutralAppraisal(): Appraisal {
  return { version: 2, kind: 'neutral', topic: 'ordinary', engagement: 'uncertain', confidence: 0, replyTargets: [], disappointment: 0, complete: false };
}
export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const emotionalHalfLife = (p: Personality) => (30 + (11 - p.traits.resilience) * 24) * 60_000;
