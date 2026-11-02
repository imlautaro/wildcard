// Runtime settings that super admins change from apps/admin without a redeploy.
// The code that reads a setting owns its default, so a key needs a definition
// here before the panel can show or change it. Values are booleans for now.
export const settingDefinitions = {
  registration_enabled: {
    label: 'New account registration',
    description: 'Allow anyone to create a Wildcard account on iOS and the web. Existing accounts can always sign in.',
    defaultValue: true,
  },
  voice_messages_enabled: {
    label: 'Contact voice messages',
    description: 'Let contacts reply with synthesized voice messages (ElevenLabs) and show the voice settings in contact details. Requires ELEVENLABS_API_KEY. People can always send voice messages.',
    defaultValue: false,
  },
  contributor_only: {
    label: 'Contributor model only',
    description: 'Process every account with Muse Spark 1.3 Contributor and hide the Standard option. Saved account choices are kept and apply again when this is turned off. MCP-isolated chats still use Standard, and Contributor consent checks still apply.',
    defaultValue: false,
  },
} as const satisfies Record<string, { label: string; description: string; defaultValue: boolean }>;

export type SettingKey = keyof typeof settingDefinitions;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingDefinitions, key);
}

// Read on every use, without an isolate cache, so a change applies to the next request.
export async function readSetting(db: D1Database, key: SettingKey): Promise<boolean> {
  const row = await db.prepare('SELECT value FROM app_setting WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? row.value === 'true' : settingDefinitions[key].defaultValue;
}

export async function listSettings(db: D1Database) {
  const { results } = await db.prepare('SELECT key, value, updated_at AS updatedAt, updated_by AS updatedBy FROM app_setting')
    .all<{ key: string; value: string; updatedAt: number; updatedBy: string | null }>();
  const stored = new Map(results.map((row) => [row.key, row]));
  return Object.entries(settingDefinitions).map(([key, definition]) => {
    const row = stored.get(key);
    return {
      key, label: definition.label, description: definition.description, defaultValue: definition.defaultValue,
      value: row ? row.value === 'true' : definition.defaultValue,
      updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null,
    };
  });
}
