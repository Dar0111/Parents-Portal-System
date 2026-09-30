const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

// PROFILE PHOTOS (feat/profile-photos, 2026-09-30). Every user uploads,
// replaces and removes their OWN photo; an admin may only remove someone
// else's. `users.profile_pic` (in schema.sql since the initial commit) holds
// the FILE NAME only — never a URL, because the web and the phone reach the
// API at different hosts.
//
// THE NAME IS 32 RANDOM HEX CHARACTERS + `.jpg` AND NOTHING ELSE. No login
// id (a parent's IS the child's LRN, §5c), no user id, no timestamp. It is
// the photo's only access control: the `/uploads` mount serves it without a
// token (an <img> cannot send one), so the name is a 128-bit capability, and
// it only ever appears in replies the viewer is already scoped to. Every
// upload gets a NEW name, so a replaced photo's old address stops working
// and no cache can serve the old picture.
//
// EVERY UPLOAD IS RE-ENCODED, never stored as sent: decoded by sharp (the
// real format check — the file name and the declared type are ignored),
// turned upright by its EXIF orientation, cut to a 512 × 512 square and
// written as a fresh JPEG. sharp writes no metadata unless asked, so EXIF —
// including a phone's GPS position, which can be a family's home (RA 10173)
// — never reaches the disk.

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const MAX_BYTES = 5 * 1024 * 1024;
const SIZE = 512;
const MAX_INPUT_PIXELS = 40_000_000;
const INPUT_FORMATS = new Set(['jpeg', 'png', 'webp']);
const PHOTO_NAME = /^[0-9a-f]{32}\.jpg$/;

const MESSAGES = {
  missing: 'Choose a photo to upload.',
  type: 'Choose a JPEG, PNG or WebP image.',
  size: 'The photo must be 5 MB or smaller.',
  count: 'Send one photo at a time.',
};

function ensureAvatarDir() {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

// Memory storage: nothing touches the disk until sharp has decoded and
// re-encoded it. One file, in a field named `photo`, at most 5 MB.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
}).single('photo');

// Resolves { file } or { status, message } — every refusal in the API's
// uniform { success: false, message } shape, decided here once.
function receivePhoto(req, res) {
  return new Promise((resolve) => {
    single(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return resolve({ status: 413, message: MESSAGES.size });
        return resolve({ status: 400, message: MESSAGES.count });
      }
      if (!req.file || !req.file.buffer || !req.file.buffer.length) {
        return resolve({ status: 400, message: MESSAGES.missing });
      }
      return resolve({ file: req.file });
    });
  });
}

// The re-encode. Anything sharp cannot decode, or decodes as a format we do
// not take (GIF, TIFF, SVG, AVIF, HEIF …), is the same one refusal.
async function reencode(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    return { error: MESSAGES.type };
  }
  if (!INPUT_FORMATS.has(meta.format)) return { error: MESSAGES.type };
  try {
    const out = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(SIZE, SIZE, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { buffer: out };
  } catch {
    return { error: MESSAGES.type };
  }
}

// Writes the re-encoded bytes under a fresh random name; `wx` refuses to
// overwrite, so a (vanishingly unlikely) collision fails loudly instead of
// replacing someone else's photo.
async function writePhoto(buffer) {
  ensureAvatarDir();
  const name = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, name), buffer, { flag: 'wx' });
  return name;
}

// Best effort, after the row no longer points at it. A name that is not one
// of ours is never turned into a path; a file already gone is fine; any other
// failure leaves an unreferenced file behind, which is harmless and says so.
async function removePhotoFile(name) {
  if (!name || !PHOTO_NAME.test(name)) return;
  try {
    await fs.promises.unlink(path.join(AVATAR_DIR, name));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Profile photo: an old file could not be deleted; it is unreferenced.', err.code);
  }
}

module.exports = {
  AVATAR_DIR,
  MAX_BYTES,
  SIZE,
  PHOTO_NAME,
  MESSAGES,
  ensureAvatarDir,
  receivePhoto,
  reencode,
  writePhoto,
  removePhotoFile,
};
