import { keywords, selectMemories, type Memory } from './memory';

export const semanticLimits = {
  model: '@cf/baai/bge-m3', dimensions: 1024,
  // Embeddings computed per ranking call, so a large backlog spreads over several turns.
  embedPerCall: 32, timeoutMs: 5000, minimumSimilarity: 0.5, results: 8,
} as const;

const tables = ['contact_memory', 'group_memory'] as const;
type Table = typeof tables[number];

// Unit vectors stored as signed bytes: 1 KiB per memory, cosine is a dot product.
function quantize(vector: number[]) {
  const norm = Math.hypot(...vector) || 1;
  return new Int8Array(vector.map(value => Math.max(-127, Math.min(127, Math.round(value / norm * 127)))));
}
function bytes(value: unknown): Int8Array | null {
  if (value instanceof ArrayBuffer) return new Int8Array(value);
  if (ArrayBuffer.isView(value)) return new Int8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return new Int8Array(Uint8Array.from(value as number[]).buffer);
  return null;
}
function cosine(a: Int8Array, b: Int8Array) {
  if (a.length !== semanticLimits.dimensions || b.length !== semanticLimits.dimensions) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index++) dot += a[index]! * b[index]!;
  return dot / (127 * 127);
}
const memoryText = (memory: Memory) => `${memory.key.replaceAll('_', ' ')}: ${memory.content}`;

async function embed(env: Env, texts: string[]) {
  const output = await Promise.race([
    env.AI.run(semanticLimits.model, { text: texts, truncate_inputs: true }) as Promise<{ data?: number[][] }>,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SEMANTIC_TIMEOUT')), semanticLimits.timeoutMs)),
  ]);
  if (!Array.isArray(output.data) || output.data.length !== texts.length
    || output.data.some(vector => !Array.isArray(vector) || vector.length !== semanticLimits.dimensions)) throw new Error('SEMANTIC_INVALID_OUTPUT');
  return output.data.map(quantize);
}

/**
 * Hybrid memory ranking. Candidates are only memories the caller already read under
 * its own access/consent rules; embeddings never widen that set. Lexical matches stay
 * eligible, and semantically similar memories join them. Disabled, isolated or failing
 * semantic ranking falls back to the existing lexical selection.
 */
export async function rankMemories(env: Env, memories: Memory[], query: string, includePreferences = false, allowSemantic = true): Promise<Memory[]> {
  const eligible = memories.filter(memory => memory.embedRef);
  if (env.SEMANTIC_MEMORY_ENABLED !== 'true' || !allowSemantic || !query.trim() || !eligible.length) return selectMemories(memories, query, includePreferences);
  try {
    const refs = new Map<Table, Map<number, Memory>>();
    for (const memory of eligible) {
      const [table, id] = memory.embedRef!.split(':') as [Table, string];
      if (!tables.includes(table)) continue;
      if (!refs.has(table)) refs.set(table, new Map());
      refs.get(table)!.set(Number(id), memory);
    }
    const vectors = new Map<Memory, Int8Array>();
    for (const [table, rows] of refs) {
      // Content is part of the match, so a vector computed for older text is ignored.
      const { results } = await env.DB.prepare(`SELECT rowid AS id, content, embedding FROM ${table}
        WHERE rowid IN (SELECT value FROM json_each(?)) AND embedding IS NOT NULL`).bind(JSON.stringify([...rows.keys()]))
        .all<{ id: number; content: string; embedding: unknown }>();
      for (const row of results) {
        const memory = rows.get(row.id), vector = bytes(row.embedding);
        if (memory && vector && row.content === memory.content) vectors.set(memory, vector);
      }
    }
    const missing = eligible.filter(memory => !vectors.has(memory)).slice(0, semanticLimits.embedPerCall);
    const [queryVector, ...computed] = await embed(env, [query.slice(0, 2000), ...missing.map(memoryText)]);
    const writes = missing.map((memory, index) => {
      vectors.set(memory, computed[index]!);
      const [table, id] = memory.embedRef!.split(':') as [Table, string];
      // Only store a vector for the exact content embedded; a concurrent edit wins.
      return env.DB.prepare(`UPDATE ${table} SET embedding = ? WHERE rowid = ? AND content = ?`).bind(computed[index]!.buffer, Number(id), memory.content);
    });
    if (writes.length) await env.DB.batch(writes);
    const terms = keywords(query);
    return memories.map((memory, index) => {
      const text = `${memory.sourceUserName} ${memory.key} ${memory.content} ${memory.sourceQuote}`.normalize('NFKC').toLowerCase();
      const lexical = terms.length ? terms.filter(term => text.includes(term)).length / terms.length : 0;
      const vector = vectors.get(memory), similarity = vector ? cosine(queryVector!, vector) : 0;
      return { memory, index, lexical, similarity, score: lexical + similarity };
    }).filter(({ memory, lexical, similarity }) => lexical > 0 || similarity >= semanticLimits.minimumSimilarity
      || (includePreferences && memory.kind === 'preference'))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, semanticLimits.results)
      .map(({ memory: { embedRef: _ref, ...memory } }) => memory);
  } catch {
    console.error(JSON.stringify({ event: 'semantic_memory_unavailable' }));
    return selectMemories(memories, query, includePreferences);
  }
}
