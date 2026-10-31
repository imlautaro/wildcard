// Offline regression: node scripts/checks/mojibake.mjs
// Garbled UTF-8 from model output is repaired; ordinary text is untouched.
import assert from 'node:assert/strict';
import { repairMojibake } from '../../shared/mojibake.ts';

const garble = text => Array.from(new TextEncoder().encode(text), byte => new TextDecoder('windows-1252').decode(new Uint8Array([byte]))).join('');
const cases = [
  ['Jaja ðŸ˜€ qué bueno', 'Jaja 😀 qué bueno'],
  [`Dale ${garble('🎉🔥')} nos vemos`, 'Dale 🎉🔥 nos vemos'],
  [`It${garble('’')}s fine ${garble('—')} really ${garble('…')}`, 'It’s fine — really …'],
  [`Caf${garble('é')} y ${garble('¿')}ma${garble('ñ')}ana?`, 'Café y ¿mañana?'],
  [`Te quiero ${garble('❤️')}`, 'Te quiero ❤️'],
  [`${garble('👍🏽')} listo`, '👍🏽 listo'],
  ['Mirá esto ðŸ y seguimos', 'Mirá esto  y seguimos'],
];
for (const [input, expected] of cases) assert.equal(repairMojibake(input), expected, JSON.stringify(input));
// Real text must never change.
for (const text of ['¿Mañana? ¡Sí! Está……', 'São Paulo, NÃO', 'Ðorđe ðá', 'Ação — “citas” 😀 ❤️ ™ €5', 'âge, naïve, Noël', 'año ñ¿', 'x'.repeat(5000)]) {
  assert.equal(repairMojibake(text), text, JSON.stringify(text));
}
console.log(`mojibake: ${cases.length + 7} checks passed`);
