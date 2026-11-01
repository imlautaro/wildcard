// Prints a fresh VAPID key pair for browser Web Push. Run once per installation
// and store the values as encrypted secrets; never commit them or paste them in chat.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
console.log(`VAPID_PUBLIC_KEY=${publicKey.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # replace with your own contact');
