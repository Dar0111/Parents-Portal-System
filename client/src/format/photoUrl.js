// A PROFILE PHOTO'S ADDRESS (feat/profile-photos, 2026-09-30). A MIRROR:
// copied byte for byte to mobile/src/format/photoUrl.js and proved equal by
// `lint:mirrors`, so the web and the phone build the address one way.
//
// `users.profile_pic` holds a FILE NAME, never a URL — the web and the phone
// reach the API at different hosts. The server writes exactly 32 lowercase
// hex characters + `.jpg` (server/utils/profilePhoto.js), and this refuses
// anything else, so a stray value — say one restored from an old dump —
// never becomes a request. The name never carries a login id (§5c).
//
// `apiBase` is the client's API base URL ('http://host:5000/api'); photos are
// served beside the API at '/uploads/avatars/<name>', so the trailing '/api'
// is dropped. No photo, a bad name or no base → null, and the caller shows
// initials.
const PHOTO_NAME = /^[0-9a-f]{32}\.jpg$/;

export function photoUrl(name, apiBase) {
  if (typeof name !== 'string' || !PHOTO_NAME.test(name)) return null;
  if (typeof apiBase !== 'string' || !apiBase.trim()) return null;
  const origin = apiBase.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  return `${origin}/uploads/avatars/${name}`;
}
