// Response shapes mirror the iOS client models in apps/ios/Wildcard.
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  photoVersion?: string | null;
};

export type Contact = {
  id: string;
  name: string;
  agentID?: string | null;
  role?: string | null;
  photoVersion?: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  unreadCount?: number | null;
  lastReadSequence?: number | null;
};

export type ContactsPage = { contacts: Contact[]; totalUnreadCount?: number | null; nextCursor: string | null };

export type Attachment = { name: string; mimeType: string; size: number };
export type DraftAttachment = Attachment & { data: string; previewURL: string | null };

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
  status: TurnStatus;
  attempt: number;
  createdAt: number;
  readAt: number | null;
  updatedAt: number;
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
  lastMessageText: string | null;
  lastMessageAt: number | null;
  lastMessageSenderName: string | null;
  photoVersion: string | null;
  unreadCount?: number | null;
  lastReadSequence?: number | null;
};
export type GroupMember = { id: string; kind: 'user' | 'agent'; name: string; photoVersion: string | null; canInvite: number; addedBy: string | null };
export type GroupReply = { id: string; agentID: string; name: string; status: string };
export type GroupMessage = {
  sequence: number;
  id: string;
  userID: string | null;
  agentID: string | null;
  senderName: string;
  text: string;
  createdAt: number;
  attachment: Attachment | null;
};
export type GroupSnapshot = { group: ChatGroup; members: GroupMember[]; replies: GroupReply[]; canInvite: boolean; contributorModel: boolean };
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
