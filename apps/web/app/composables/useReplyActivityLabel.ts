import type { ReplyActivity, ReplyActivityEntry } from '../../../../shared/activity';

// Localized group subtitle for active replies. It follows the rules of
// shared/activity.ts `replyActivityLabel` (which the API keeps for its English
// previews): unique names, one clause per activity in first-seen order, and
// "N people are typing..." once more than three names, or a line longer than 48
// characters, would not fit. Each clause and line is a whole message.
const maxNames = 3;
const maxLength = 48;

const lineKeys = ['groups.chat.activity.line1', 'groups.chat.activity.line2', 'groups.chat.activity.line3'] as const;

function clause(activity: ReplyActivity, names: string[]) {
  return translate(`groups.chat.activity.${activity}`, { names: nameList(names) }, names.length);
}

export function localizedReplyActivityLabel(entries: ReplyActivityEntry[]): string | null {
  const unique = entries.filter((entry, index) => entries.findIndex((other) => other.name === entry.name) === index);
  if (!unique.length) return null;
  const activities = [...new Set(unique.map((entry) => entry.activity))];
  const clauses = activities.map((activity) => clause(activity, unique.filter((entry) => entry.activity === activity).map((entry) => entry.name)));
  const [first, second, third] = clauses;
  const named = translate(lineKeys[clauses.length - 1]!, { first, second, third });
  if (unique.length === 1 || (unique.length <= maxNames && named.length <= maxLength)) return named;
  const activity = activities.length === 1 ? activities[0]! : 'replying';
  return translate(`groups.chat.people.${activity}`, unique.length);
}

/** "Ana working…" for contacts busy with task work. */
export function localizedWorkingLabel(names: string[]): string | null {
  const unique = [...new Set(names)];
  return unique.length ? translate('groups.chat.working', { names: nameList(unique) }, unique.length) : null;
}
