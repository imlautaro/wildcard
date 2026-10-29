// Response shapes mirror the iOS client models in apps/ios/Wildcard.
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  onboardingRequired?: boolean;
  chatModel?: 'muse-spark-1.3' | 'muse-spark-1.3-contributor';
  photoVersion?: string | null;
};

export type Contact = {
  id: string;
  name: string;
  initiativeEnabled?: number;
  agentID?: string | null;
  role?: string | null;
  photoVersion?: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string | null;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  // 1 when the latest turn is the user's own message (no reply, schedule, or group request).
  lastMessageFromUser?: number | null;
  lastMessageReadAt?: number | null;
  unreadCount?: number | null;
  lastReadSequence?: number | null;
};

export type ContactEnergy = { points: number; capacity: number; rechargeIntervalSeconds: number; nextPointAt: number | null };

export type ContactsPage = { contacts: Contact[]; totalUnreadCount?: number | null; nextCursor: string | null };

export type Attachment = { name: string; mimeType: string; size: number };
export type DraftAttachment = Attachment & { data: string; previewURL: string | null };

// An earlier message quoted by a reply, resolved by the server from current history.
// Private quotes omit sender identity: `side` tells whether the user or contact wrote it.
export type ReplyQuote = {
  messageID: string;
  side: 'user' | 'assistant' | 'group';
  available: boolean;
  userID: string | null;
  agentID: string | null;
  senderName: string | null;
  text: string;
  previewText?: string;
  attachment: Attachment | null;
};

export type TurnStatus = 'queued' | 'running' | 'complete' | 'failed';
export type ChatTurn = {
  attachment?: Attachment | null;
  scheduleID: string | null;
  groupRequestID: string | null;
  errorCode: string | null;
  sequence: number;
  id: string;
  userText: string;
  assistantText: string | null;
  assistantMessages?: { id: string; text: string; createdAt: number; replyTo?: ReplyQuote | null }[];
  status: TurnStatus;
  attempt: number;
  createdAt: number;
  readAt: number | null;
  updatedAt: number;
  replyTo?: ReplyQuote | null;
};

export type Presence = { status: 'offline' | 'online' | 'typing'; lastSeenAt: number | null; expiresAt: number | null };
export type ChatPage = { presence: Presence | null; turns: ChatTurn[]; nextBefore: number | null };
export type ChatSubmission = { turn: ChatTurn; presence: Presence | null };
export type ChatReadState = { lastReadSequence: number; totalUnreadCount?: number | null; unreadCount: number };

export type ChatGroup = {
  id: string;
  name: string;
  ownerID: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string | null;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  lastMessageSenderName: string | null;
  lastMessageID?: string | null;
  lastMessageUserID?: string | null;
  lastMessageReceiptState?: string | null;
  photoVersion: string | null;
  unreadCount?: number | null;
  lastReadSequence?: number | null;
};
export type GroupMember = { id: string; kind: 'user' | 'agent'; name: string; photoVersion: string | null; canInvite: number; addedBy: string | null };
export type GroupReply = { isTyping?: number; id: string; agentID: string; name: string; status: string; sourceID?: string; sourceSequence?: number; attempt?: number };
export type GroupMessage = {
  sequence: number;
  id: string;
  userID: string | null;
  agentID: string | null;
  senderName: string;
  text: string;
  createdAt: number;
  attachment: Attachment | null;
  // Aggregate recipient state: sent, received, or read; null for legacy messages.
  receiptState?: string | null;
  replyTo?: ReplyQuote | null;
};
export type GroupPrivateSharing = { agentID: string; enabled: number; available: number };
export type GroupSnapshot = { privateSharing?: GroupPrivateSharing[]; group: ChatGroup; members: GroupMember[]; replies: GroupReply[]; canInvite: boolean; contributorModel: boolean };
export type GroupMessagesPage = { messages: GroupMessage[]; nextBefore: number | null };
export type GroupInvitation = { id: string; groupName: string; senderName: string; expiresAt: number };

export type ContactSharing = {
  members: { id: string; name: string; role: string }[];
  invitations: { id: string; expiresAt: number; recipientEmail: string | null }[];
  contributorModel: boolean;
};
export type ContactInvitation = { code: string | null; recipientEmail: string | null; expiresAt: number };
export type InvitationPreview = { name: string; expiresAt: number; contributorModel: boolean };
export type ReceivedContactInvitation = { id: string; contactName: string; senderName: string; expiresAt: number };

export type MiniAppFormat = 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'text';
export type MiniAppInput = { id: string; type: 'segmented'; label: string; options: { value: string; label: string }[]; default: string }
  | { id: string; type: 'text' | 'number'; label: string; default: string };
export type MiniAppField = { id: string; label: string; kind: 'text' | 'number' | 'date' | 'toggle'; required: boolean };
export type MiniApp = {
  id: string; turnID: string | null; revision: number; title: string; subtitle: string | null; icon: string;
  status: 'needs_review' | 'enabled' | 'needs_reapproval'; inputs: MiniAppInput[];
  tools: { connectionID: string; connectionName: string; toolName: string; role: 'read' | 'write' }[];
  tabs?: { id: string; title: string; icon: string }[];
  issues: { step: string; code: string }[]; createdAt: number; updatedAt: number;
};
export type MiniAppComponent =
  | { type: 'section'; title: string | null; children: MiniAppComponent[] }
  | { type: 'stat'; label: string; value: number | string | null; format: MiniAppFormat; currency: string | null; caption: string | null; state: string | null }
  | { type: 'list'; items: MiniAppRow[]; format: MiniAppFormat; currency: string | null; empty: string }
  | { type: 'progress'; label: string; value: number | null; goal: number; format: MiniAppFormat; currency: string | null; caption: string | null; state: string | null; style?: 'bar' | 'ring' }
  | { type: 'checklist'; state: string; title: string; subtitle: string | null; value: string | null; done: string | null; removable: boolean; items: (MiniAppRow & { done: boolean | null })[]; format: MiniAppFormat; currency: string | null; empty: string }
  | { type: 'toggle'; label: string; state: string; value: boolean }
  | { type: 'choice'; label: string; state: string; value: string; options: { value: string; label: string }[] }
  | { type: 'input'; label: string; state: string; value: string | number; kind: 'text' | 'number'; placeholder: string | null }
  | { type: 'timer'; label: string; seconds: number }
  | { type: 'chart'; kind: 'bar' | 'line' | 'area' | 'pie'; title: string | null; points: { x: string; y: number }[]; format: MiniAppFormat; currency: string | null }
  | { type: 'text'; text: string; style: 'body' | 'caption' | 'headline' }
  | MiniAppAction
  | { type: 'grid'; columns: 2 | 3; children: MiniAppComponent[] }
  | { type: 'tile'; title: string; caption: string | null; icon: string | null; value: number | string | null; format: MiniAppFormat; currency: string | null; state: string | null; tab: string | null; action: MiniAppAction | null }
  | MiniAppComposer
  | { type: 'lesson'; title: string; hearts: number; xp: string | null; questions: { prompt: string; options: string[] | null; correct: number | null; answers: string[] | null; explain: string | null }[] }
  | { type: 'notice'; code: string };
export type MiniAppAction = { type: 'action'; id: string; kind: 'remote' | 'state'; label: string; confirm: string | null; style: 'default' | 'destructive'; fields: MiniAppField[]; updates: MiniAppUpdate[] | null };
// A text bar pinned to the bottom of its screen; `append` lets a submitted row show at once.
export type MiniAppComposer = { type: 'composer'; action: string; field: string; kind: 'text' | 'number'; placeholder: string | null; label: string; confirm: string | null; remote: boolean;
  append: { state: string; key: string; item: MiniAppItem } | null };
export type MiniAppRow = { title: string; subtitle: string | null; value: number | string | null };
export type MiniAppItem = Record<string, number | string | boolean>;
export type MiniAppStateValue = number | string | boolean | MiniAppItem[];
export type MiniAppUpdate = { state: string; op: 'increment' | 'decrement' | 'set' | 'toggle' | 'append' | 'clear' | 'pick' | 'set_items' | 'remove_where' | 'toggle_item' | 'remove_item'; value?: MiniAppStateValue | null; index?: number; field?: string };
export type MiniAppResolution = { revision: number; inputs: Record<string, string>; resolvedAt: number; view: MiniAppComponent[];
  tabs?: { id: string; title: string; icon: string; view: MiniAppComponent[] }[]; menu?: MiniAppAction[]; issues: { step: string; code: string }[];
  state?: Record<string, MiniAppStateValue>; remote?: boolean };
