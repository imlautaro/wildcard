// Group reply activity for chat-list previews and the web group subtitle:
// "Ana is typing...", "Ana and Bo are typing...", "Ana is researching, Bo is typing...",
// and "4 people are typing..." once more than three names (or a long line) would not fit.
export type ReplyActivity = 'typing' | 'recording' | 'researching';
export type ReplyActivityEntry = { name: string; activity: ReplyActivity };

const maxNames = 3;
const maxLength = 48;

function joinNames(names: string[]) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function replyActivityLabel(entries: ReplyActivityEntry[]): string | null {
  const unique = entries.filter((entry, index) => entries.findIndex((other) => other.name === entry.name) === index);
  if (!unique.length) return null;
  const activities = [...new Set(unique.map((entry) => entry.activity))];
  const named = activities.map((activity) => {
    const names = unique.filter((entry) => entry.activity === activity).map((entry) => entry.name);
    return `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} ${activity}`;
  }).join(', ');
  if (unique.length === 1 || (unique.length <= maxNames && named.length + 3 <= maxLength)) return `${named}...`;
  return `${unique.length} people are ${activities.length === 1 ? activities[0] : 'replying'}...`;
}
