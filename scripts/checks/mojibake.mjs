// Offline regression: node scripts/checks/mojibake.mjs
// Garbled UTF-8 from model output is repaired; ordinary text is untouched.
import assert from 'node:assert/strict';
import { repairMojibake, unescapeLatin1 } from '../../shared/mojibake.ts';

const garble = text => Array.from(new TextEncoder().encode(text), byte => new TextDecoder('windows-1252').decode(new Uint8Array([byte]))).join('');
const cases = [
  ['Jaja ðŸ˜€ qué bueno', 'Jaja 😀 qué bueno'],
  [`Dale ${garble('🎉🔥')} nos vemos`, 'Dale 🎉🔥 nos vemos'],
  [`It${garble('’')}s fine ${garble('—')} really ${garble('…')}`, 'It’s fine — really …'],
  [`Caf${garble('é')} y ${garble('¿')}ma${garble('ñ')}ana?`, 'Café y ¿mañana?'],
  [`Te quiero ${garble('❤️')}`, 'Te quiero ❤️'],
  [`${garble('👍🏽')} listo`, '👍🏽 listo'],
  ['Mirá esto ðŸ y seguimos', 'Mirá esto  y seguimos'],
  // A lone emoji lead byte, usually where a final emoji should be.
  ['Qué genial ð', 'Qué genial'],
  ['Qué genial!ð', 'Qué genial!'],
  ['ð nos vemos mañana', ' nos vemos mañana'],
  ['jaja ð\u009f\u0098', 'jaja '],
  // Escaped bytes inside a JSON answer, repaired once written literally.
  [unescapeLatin1('{"messages":["Felicidades \\u00f0\\u009f\\u008e\\u0089"]}'), '{"messages":["Felicidades 🎉"]}'],
  [unescapeLatin1('{"messages":["caf\\u00e9 ok \\u00f0\\u009f\\u0098\\u0080"]}'), '{"messages":["café ok 😀"]}'],
];
for (const [input, expected] of cases) assert.equal(repairMojibake(input), expected, JSON.stringify(input));
// Real text must never change.
for (const text of ['¿Mañana? ¡Sí! Está……', 'São Paulo, NÃO', 'Ðorđe ðá', 'Við erum', 'með', 'Guðrún', 'Ação — “citas” 😀 ❤️ ™ €5', 'âge, naïve, Noël', 'año ñ¿', 'x'.repeat(5000)]) {
  assert.equal(repairMojibake(text), text, JSON.stringify(text));
}
// An escaped backslash before u00e9 is literal text, not an escape.
assert.equal(unescapeLatin1('{"a":"\\\\u00e9 \\u00e9 \\uD83D"}'), '{"a":"\\\\u00e9 é \\uD83D"}');
for (const json of ['{"m":"\\u00f1o\\u00f1o"}', '{"m":"x\\\\\\u00e9"}']) assert.deepEqual(JSON.parse(unescapeLatin1(json)), JSON.parse(json));
console.log(`mojibake: ${cases.length + 13} checks passed`);
