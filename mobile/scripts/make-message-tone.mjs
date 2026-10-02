// mobile/scripts/make-message-tone.mjs — generates
// mobile/assets/sounds/message-tone.wav, the phone's copy of the web message
// tone (FRONTEND_CONVENTIONS §26, MOBILE_CONVENTIONS M22).
//
// THE NUMBERS ARE NOT HERE: they are `TONE` in the mirrored
// src/realtime/messageToast.js — "two-note rise": 587 Hz at 0 ms for 140 ms
// and 880 Hz at 80 ms for 280 ms, each with its octave (1174 Hz for 60 ms,
// 1760 Hz for 90 ms), peak 0.125 each, 360 ms in all — the same object the
// web's Web Audio tone reads, so the two sounds cannot drift apart without
// lint:mirrors noticing.
//
// THE WEB'S ENVELOPE, SAMPLE BY SAMPLE: per voice, from the floor (0.0001)
// a LINEAR rise to the peak over 6 ms, then an EXPONENTIAL decay back to the
// floor at start + duration, held at the floor for the 20 ms until the web
// stops the oscillator; each voice's phase starts at its own start time
// (an oscillator started then). The voices are SUMMED.
//
// 16-bit PCM, mono, 22 050 Hz. Re-running it writes the same bytes.
// Run from mobile/:  npm run tone:write   (node scripts/make-message-tone.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TONE } from '../src/realtime/messageToast.js';

export const SAMPLE_RATE = 22050;

// One voice's gain at `u` seconds after the voice started (0 outside it).
function envelope(u, voice, tone) {
  const attack = tone.attackMs / 1000;
  const duration = voice.durationMs / 1000;
  if (u < 0) return 0;
  if (u < attack) return tone.floor + (voice.peak - tone.floor) * (u / attack);
  if (u < duration) return voice.peak * (tone.floor / voice.peak) ** ((u - attack) / (duration - attack));
  if (u < duration + tone.stopPadMs / 1000) return tone.floor;
  return 0;
}

export function buildToneWav(tone = TONE, sampleRate = SAMPLE_RATE) {
  const samples = Math.round((sampleRate * tone.totalMs) / 1000);
  const data = Buffer.alloc(samples * 2);
  let peak = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    let v = 0;
    for (const voice of tone.voices) {
      const u = t - voice.startMs / 1000;
      if (u < 0) continue;
      v += Math.sin(2 * Math.PI * voice.freqHz * u) * envelope(u, voice, tone);
    }
    peak = Math.max(peak, Math.abs(v));
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
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
  // `peak` is the loudest summed sample before 16-bit rounding, as a fraction
  // of full scale — about 0.25 at most (a note and its octave, 0.125 each,
  // are the only voices that peak together), so nothing clips.
  return { bytes: Buffer.concat([header, data]), samples, peak };
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const TONE_PATH = path.join(here, '..', 'assets', 'sounds', 'message-tone.wav');

// Only write when run directly, so a proof can import buildToneWav.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bytes, samples, peak } = buildToneWav();
  fs.mkdirSync(path.dirname(TONE_PATH), { recursive: true });
  fs.writeFileSync(TONE_PATH, bytes);
  console.log(
    `make-message-tone: wrote ${path.relative(process.cwd(), TONE_PATH)} — ${bytes.length} bytes, ${samples} samples, peak ${peak.toFixed(4)} of full scale`
  );
}
