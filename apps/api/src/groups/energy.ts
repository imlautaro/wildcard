// SQL aliases are internal constants, never HTTP or model input.
export const energyPoints = (alias: string) =>
  `MIN(50, ${alias}.energy + MAX(0, (unixepoch() * 1000 - ${alias}.energy_updated_at) / 300000))`;

export function groupEnergyAvailable(reply: string) {
  return `EXISTS (SELECT 1 FROM contact_agent energy_agent WHERE energy_agent.id = ${reply}.agent_id
    AND ${energyPoints('energy_agent')} > 0)
    AND NOT EXISTS (SELECT 1 FROM group_message source JOIN group_exchange exchange ON exchange.root_id = source.exchange_id
      WHERE source.id = ${reply}.source_id AND exchange.bot_messages >= 100)`;
}

export async function readEnergy(db: D1Database, agentID: string) {
  const row = await db.prepare(`SELECT ${energyPoints('a')} AS points,
    a.energy_updated_at + (MAX(0, (unixepoch() * 1000 - a.energy_updated_at) / 300000) + 1) * 300000 AS nextPointAt
    FROM contact_agent a WHERE a.id = ?`).bind(agentID).first<{ points: number; nextPointAt: number }>();
  if (!row) throw new Error('CONTACT_NOT_FOUND');
  return { points: row.points, capacity: 50, rechargeIntervalSeconds: 300,
    nextPointAt: row.points === 50 ? null : row.nextPointAt };
}
