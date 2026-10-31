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
// Server feature switches returned next to `user` by GET /me (docs/voice.md).
export type Features = { voiceMessages: boolean };

export type Contact = {
  archivedAt?: number | null;
  historyRevision?: number;
  clearing?: number;
  onboardingChat?: number;
  setupPending?: number;
  id: string;
  // The name this account reads: its private alias when set, else the shared name.
  name: string;
  // The shared name other participants see, and this account's private alias (null when unset).
  realName?: string;
  alias?: string | null;
  initiativeEnabled?: number;
  // The contact's shared voice and this participant's voice-reply opt-in (0 or 1).
  speechAccent?: string | null;
  voiceID?: string | null;
  voiceName?: string | null;
  voiceMessagesEnabled?: number;
  agentID?: string | null;
  role?: string | null;
  photoVersion?: string | null;
  createdAt: number;
  updatedAt: number;
  replyActivity?: string | null;
  lastMessageVoice?: VoiceInfo | null;
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
// A recorded voice message (docs/voice.md): `listenedAt` turns the outgoing microphone
// blue; `transcript` is null while transcribing and "" when no speech was detected.
export type VoiceInfo = { durationMs: number; ownListenedAt?: number | null; listenedAt: number | null; transcript: string | null };
// A recorded clip waiting to be sent: mono 16 kHz PCM16 WAV and its base64 body.
export type DraftVoice = { blob: Blob; data: string; durationMs: number };
export type VoiceOption = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; description: string | null };
// A chat attachment listed in chat details. Private chats set `side`; groups set the sender.
export type ChatMediaItem = Attachment & { messageID: string; sequence: number; createdAt: number; side?: 'user' | 'assistant';
  senderName?: string; userID?: string | null; agentID?: string | null };

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
  taskID?: string | null;
  // Title of the task a work turn is for, so the chat can say what the contact is working on.
  taskTitle?: string | null;
  groupRequestID: string | null;
  errorCode: string | null;
  sequence: number;
  id: string;
  userText: string;
  assistantText: string | null;
  assistantMessages?: { id: string; text: string; createdAt: number; replyTo?: ReplyQuote | null; attachment?: Attachment | null; voice?: VoiceInfo | null }[];
  status: TurnStatus;
  attempt: number;
  createdAt: number;
  readAt: number | null;
  updatedAt: number;
  replyTo?: ReplyQuote | null;
  voice?: VoiceInfo | null;
};

export type Presence = { status: 'offline' | 'online' | 'typing'; isRecording?: boolean; isResearching?: boolean; lastSeenAt: number | null; expiresAt: number | null };
export type ChatPage = { historyRevision?: number; presence: Presence | null; turns: ChatTurn[]; nextBefore: number | null };
export type ChatSubmission = { turn: ChatTurn; presence: Presence | null };
export type ChatReadState = { lastReadSequence: number; totalUnreadCount?: number | null; unreadCount: number };

export type ChatGroup = {
  archivedAt?: number | null;
  historyRevision?: number;
  clearing?: number;
  id: string;
  name: string;
  ownerID: string;
  createdAt: number;
  updatedAt: number;
  replyActivity?: string | null;
  lastMessageVoice?: VoiceInfo | null;
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
// taskID/taskTitle are set when the reply is a task work turn (its trigger is hidden from the transcript).
export type GroupReply = { replyActivity?: string; isTyping?: number; id: string; agentID: string; name: string; status: string; sourceID?: string; sourceSequence?: number; attempt?: number;
  taskID?: string | null; taskTitle?: string | null };
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
  voice?: VoiceInfo | null;
};
export type GroupPrivateSharing = { agentID: string; enabled: number; available: number };
export type GroupSnapshot = { privateSharing?: GroupPrivateSharing[]; group: ChatGroup; members: GroupMember[]; replies: GroupReply[]; canInvite: boolean; contributorModel: boolean };
export type GroupMessagesPage = { historyRevision?: number; messages: GroupMessage[]; nextBefore: number | null };
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
// Select fields always carry their current options (fixed, or the items of a list state, possibly none yet).
export type MiniAppField = { id: string; label: string; kind: 'text' | 'number' | 'date' | 'toggle' | 'select'; required: boolean; options?: { value: string; label: string }[] };
export type MiniApp = {
  // turnID anchors a private app's card; replyID is the group message that shows a group app's card.
  id: string; turnID: string | null; replyID: string | null; revision: number; title: string; subtitle: string | null; icon: string;
  status: 'needs_review' | 'enabled' | 'needs_reapproval'; inputs: MiniAppInput[];
  tools: { connectionID: string; connectionName: string; toolName: string; role: 'read' | 'write' }[];
  tabs?: { id: string; title: string; icon: string }[];
  issues: { step: string; code: string }[]; createdAt: number; updatedAt: number;
};
export type MiniAppComponent =
  | { type: 'section'; title: string | null; children: MiniAppComponent[] }
  | { type: 'stat'; label: string; value: number | string | null; format: MiniAppFormat; currency: string | null; caption: string | null; state: string | null }
  // Lists over a list state (`state`) can delete rows, open an edit sheet on tap and show row buttons.
  | { type: 'list'; items: MiniAppRow[]; format: MiniAppFormat; currency: string | null; empty: string; state?: string | null; removable?: boolean; edit?: MiniAppAction | null; actions?: MiniAppAction[] }
  | { type: 'progress'; label: string; value: number | null; goal: number; format: MiniAppFormat; currency: string | null; caption: string | null; state: string | null; style?: 'bar' | 'ring' }
  | { type: 'checklist'; state: string; title: string; subtitle: string | null; value: string | null; done: string | null; removable: boolean; items: (MiniAppRow & { done: boolean | null })[]; format: MiniAppFormat; currency: string | null; empty: string;
    edit?: MiniAppAction | null; actions?: MiniAppAction[] }
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
  // A top-bar button of the screen; an action with fields opens a sheet form.
  | { type: 'toolbar'; action: MiniAppAction; icon: 'plus' | null }
  | { type: 'lesson'; title: string; hearts: number; xp: string | null; questions: { prompt: string; options: string[] | null; correct: number | null; answers: string[] | null; explain: string | null }[] }
  | { type: 'notice'; code: string };
export type MiniAppAction = { type: 'action'; id: string; kind: 'remote' | 'state'; label: string; confirm: string | null; style: 'default' | 'destructive'; fields: MiniAppField[]; updates: MiniAppUpdate[] | null; row?: boolean };
// The tapped row a row action or edit runs on.
export type MiniAppRowTarget = { state: string; index: number };
// A text bar pinned to the bottom of its screen; `append` lets a submitted row show at once.
export type MiniAppComposer = { type: 'composer'; action: string; field: string; kind: 'text' | 'number'; placeholder: string | null; label: string; confirm: string | null; remote: boolean;
  append: { state: string; key: string; item: MiniAppItem } | null };
// `index`: the row's position in its list state; `values`: the edit sheet's prefilled fields.
export type MiniAppRow = { title: string; subtitle: string | null; value: number | string | null; index?: number; values?: MiniAppItem };
export type MiniAppItem = Record<string, number | string | boolean>;
export type MiniAppStateValue = number | string | boolean | MiniAppItem[];
export type MiniAppUpdate = { state: string; op: 'increment' | 'decrement' | 'set' | 'toggle' | 'append' | 'clear' | 'pick' | 'set_items' | 'remove_where' | 'toggle_item' | 'remove_item'; value?: MiniAppStateValue | null; index?: number; field?: string };
export type MiniAppResolution = { revision: number; inputs: Record<string, string>; resolvedAt: number; view: MiniAppComponent[];
  tabs?: { id: string; title: string; icon: string; view: MiniAppComponent[] }[]; menu?: MiniAppAction[]; issues: { step: string; code: string }[];
  state?: Record<string, MiniAppStateValue>; remote?: boolean };

// Shared to-do lists in a private chat or group (see docs/tasks.md).
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'canceled';
export type TaskMember = { kind: 'user' | 'agent'; id: string; name: string };
export type TaskItem = { id: string; listID: string; position: number; title: string; notes: string | null; status: TaskStatus;
  assigneeKind: 'user' | 'agent' | null; assigneeID: string | null; assigneeName: string | null; result: string | null;
  createdByKind: 'user' | 'agent'; createdByID: string; createdByName: string; version: number; createdAt: number; updatedAt: number;
  completedAt: number | null; blockedBy: string[]; blocked: boolean; workScheduled: boolean;
  workState: 'active' | 'paused' | 'blocked'; nextStep: string | null; evidence: string | null; blockedReason: string | null; workUsed: number; workLimit: number; researchQuery: string | null; researchUsed: number; researchLimit: number; researchStatus: 'pending' | 'ready' | 'complete' | 'failed' | 'stopped' | null;
  monitorURL: string | null; monitorKeywords: string | null; monitorInterval: 60 | 360 | 1440; monitorTurnsUsed: number; monitorTurnLimit: number; monitorPending: boolean;
  monitorChecks: { checkedAt: number; outcome: 'baseline' | 'unchanged' | 'repeated' | 'ignored' | 'changed' | 'failed'; errorCode: string | null; httpStatus: number | null }[];
  documentID: string | null; documentTitle: string | null; reviewRounds: number; reviewRoundLimit: number; reviewFeedback: string | null };
export type TaskList = { id: string; title: string; status: 'active' | 'canceled'; createdByKind: 'user' | 'agent'; createdByID: string;
  createdAt: number; updatedAt: number; tasks: TaskItem[] };
export type TaskBoard = { lists: TaskList[]; members: TaskMember[] };

// Markdown documents in a private chat or group (see docs/documents.md).
export type ResearchProvenance = { checkedAt: number; query: string; model: string; originalRevision: number;
  sources: { title: string; url: string; cited: boolean }[]; searchCalls: number; inputTokens: number | null; outputTokens: number | null };
export type ChatDocumentSummary = { id: string; title: string; revision: number; sourceID: string | null; length: number; preview: string;
  createdByKind: 'user' | 'agent'; createdByID: string; createdByName: string; updatedByKind: 'user' | 'agent'; updatedByID: string; updatedByName: string;
  createdAt: number; updatedAt: number; research?: ResearchProvenance | null };
export type ChatDocumentRevision = { revision: number; summary: string | null; authorKind: 'user' | 'agent'; authorID: string; authorName: string; createdAt: number };
export type ChatDocument = Omit<ChatDocumentSummary, 'length' | 'preview'> & { body: string; revisions: ChatDocumentRevision[] };

// Updates feed curated by the person's contacts (docs/updates.md; API resource `home`).
export type HomeCardItem = {
  title?: string; summary?: string; source?: string; url?: string; time?: string;
  home?: string; away?: string; homeScore?: number | null; awayScore?: number | null; status?: string; detail?: string;
  label?: string; value?: string; unit?: string; change?: string; trend?: 'up' | 'down' | 'flat'; caption?: string; trailing?: string;
};
export type HomeCardContent = {
  kind: 'headlines' | 'matches' | 'table' | 'metrics' | 'chart' | 'tracker' | 'note' | 'list';
  title: string; subtitle?: string; icon: string; accent: string; sources: { title: string; url: string }[];
  items?: HomeCardItem[]; columns?: string[]; rows?: string[][]; highlight?: number; caption?: string;
  style?: 'line' | 'bar'; points?: { label: string; value: number }[]; unit?: string; value?: string; change?: string;
  trend?: 'up' | 'down' | 'flat'; summary?: string; figure?: string; figureLabel?: string; status?: string; progress?: number;
  steps?: { label: string; state: 'done' | 'current' | 'upcoming'; detail?: string }[]; note?: string; text?: string; prompt?: string;
};
export type HomeCard = {
  id: string; topicID: string; contactID: string | null; contactName: string | null; contactPhotoVersion: string | null;
  reason: string | null; source: 'person' | 'contact' | 'curator'; feedback: 'more' | 'less' | null; connector: boolean;
  generatedAt: number; content: HomeCardContent;
};
export type HomeFeed = {
  enabled: boolean; status: 'idle' | 'updating'; pending: boolean; generatedAt: number | null; briefing: string | null; error: string | null;
  progress: { total: number; done: number; title: string; contactID: string; contactName: string | null } | null;
  contributors: { id: string; name: string; photoVersion: string | null }[];
  cards: HomeCard[];
  topics: { id: string; title: string; source: 'person' | 'contact' | 'curator'; status: 'active' | 'hidden'; feedback: 'more' | 'less' | null; contactID: string | null; hasCard: boolean }[];
  apps: { id: string; title: string; subtitle: string | null; icon: string | null; contactID: string | null; groupID: string | null; ownerName: string | null; opens: number }[];
  agenda: { id: string; kind: 'schedule' | 'task'; title: string; at: number | null; contactID: string | null; groupID: string | null; name: string | null }[];
};
