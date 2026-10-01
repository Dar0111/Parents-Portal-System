// mobile/scripts/make-message-tone.mjs — generates
// mobile/assets/sounds/message-tone.wav, the phone's copy of the web message
// tone (FRONTEND_CONVENTIONS §26, MOBILE_CONVENTIONS M22).
//
// THE NUMBERS ARE NOT HERE: they are `TONE` in the mirrored
// src/realtime/messageToast.js (880 Hz sine, 150 ms, 10 ms fade in / out,
// gain 0.3), the same object the web's Web Audio tone reads — so the two
// sounds cannot drift apart without lint:mirrors noticing.
//
// 16-bit PCM, mono, 22 050 Hz. Re-running it writes the same bytes.
// Run from mobile/:  npm run tone:write   (node scripts/make-message-tone.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TONE } from '../src/realtime/messageToast.js';

export const SAMPLE_RATE = 22050;

export function buildToneWav(tone = TONE, sampleRate = SAMPLE_RATE) {
  const samples = Math.round((sampleRate * tone.durationMs) / 1000);
  const fade = Math.round((sampleRate * tone.fadeMs) / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const env = Math.max(0, Math.min(1, i / fade, (samples - 1 - i) / fade));
    const v = Math.sin((2 * Math.PI * tone.freqHz * i) / sampleRate) * tone.gain * env;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return { bytes: Buffer.concat([header, data]), samples };
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const TONE_PATH = path.join(here, '..', 'assets', 'sounds', 'message-tone.wav');

// Only write when run directly, so a proof can import buildToneWav.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bytes, samples } = buildToneWav();
  fs.mkdirSync(path.dirname(TONE_PATH), { recursive: true });
  fs.writeFileSync(TONE_PATH, bytes);
  console.log(`make-message-tone: wrote ${path.relative(process.cwd(), TONE_PATH)} — ${bytes.length} bytes, ${samples} samples`);
}
