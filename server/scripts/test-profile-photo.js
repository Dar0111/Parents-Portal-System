/**
 * Profile photo API tests (feat/profile-photos, 2026-09-30):
 *   PUT /api/auth/photo, DELETE /api/auth/photo, DELETE /api/users/:id/photo,
 *   the hardened /uploads mount, and the photo name on GET /api/auth/me,
 *   GET /api/users/:id, GET /api/users/parents/pending and
 *   GET /api/messages/conversations.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * STAYS ON MARWIN'S PARENT (student_id 1) — every suite's target — plus
 * TCH-001 for one own-account upload and a one-message conversation. The
 * parent's login id is read from the database and never printed.
 *
 * CLEANS UP IN finally, AND PROVES IT: both accounts' profile_pic back to
 * what it was (NULL on the seeded baseline), every file this run wrote under
 * uploads/avatars unlinked, the one message deleted by id — then asserts the
 * directory holds exactly what it held at the start and both columns match.
 * activity_logs rows stay: they are the audit trail, as for every suite.
 *
 * Fixtures are built IN MEMORY with sharp — a PNG, a WebP and a JPEG that
 * carries a GPS block (proved present before it is sent) — plus a text file
 * posing as a PNG and 5 MB + 1 of noise. Nothing is read from or written to
 * disk except by the server.
 *
 * Usage: npm run test:profile-photo
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// PostgreSQL (Phase 3): the suites' fixture connection, test-helpers/db.js.
const { createConnection } = require('./test-helpers/db');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const NAME = /^[0-9a-f]{32}\.jpg$/;

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally (scripts/policyFixture.js, feat/privacy).
const policy = require('./policyFixture').createPolicyFixture();

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(method, urlPath, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function fetchFile(urlPath) {
  const res = await fetch(`${BASE}${urlPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf };
}

function photoForm(buffer, type, filename, field = 'photo') {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type }), filename);
  return form;
}


function listAvatars() {
  try {
    return new Set(fs.readdirSync(AVATAR_DIR));
  } catch {
    return new Set();
  }
}

const hasGpsIfd = (exif) => Boolean(exif) && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])));

async function run() {
  console.log(`\nParents Portal — Profile Photo API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const db = await createConnection();
  const [[parentRow]] = await db.query(
    "SELECT id, login_id, profile_pic FROM users WHERE student_id = 1 AND role = 'parent' LIMIT 1"
  );
  const [[teacherRow]] = await db.query("SELECT id, profile_pic FROM users WHERE login_id = 'TCH-001' LIMIT 1");
  const PARENT_LOGIN = parentRow.login_id;
  const startParentPic = parentRow.profile_pic;
  const startTeacherPic = teacherRow.profile_pic;
  const startFiles = listAvatars();
  const [[{ maxLog }]] = await db.query('SELECT COALESCE(MAX(id), 0) AS "maxLog" FROM activity_logs');
  const namesSeen = new Set();
  let messageId = null;

  try {
    const admin = await request('POST', '/api/auth/login', { body: { login_id: 'ADMIN001', password: 'Admin@2026' } });
    const teacher = await request('POST', '/api/auth/login', { body: { login_id: 'TCH-001', password: 'Teacher@2026' } });
    const parent = await request('POST', '/api/auth/login', { body: { login_id: PARENT_LOGIN, password: 'Parent@2026' } });
    const adminToken = admin.data?.token;
    const teacherToken = teacher.data?.token;
    await policy.accept(adminToken);
    await policy.accept(teacherToken);
    const parentToken = parent.data?.token;
    await policy.accept(parentToken);
    assert(adminToken && teacherToken && parentToken, 'Admin, TCH-001 and Marwin’s parent log in');
    assert(startParentPic === null, 'Marwin’s parent starts with no photo (the seeded baseline)');

    // --- fixtures -----------------------------------------------------------
    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 60, b: 40 } } }).png().toBuffer();
    const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 40, g: 160, b: 60 } } }).webp().toBuffer();
    const gpsJpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 20, g: 90, b: 160 } } })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'fixture' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 33/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '121/1 4/1 0/1' },
      })
      .toBuffer();
    const gpsMeta = await sharp(gpsJpeg).metadata();
    assert(hasGpsIfd(gpsMeta.exif), 'CONTROL: the JPEG fixture really carries a GPS block before upload');

    // --- upload, as the parent ---------------------------------------------
    console.log('\nUpload — own account');
    const noToken = await request('PUT', '/api/auth/photo', { form: photoForm(png, 'image/png', 'a.png') });
    assert(noToken.status === 401, 'No token → 401', `got ${noToken.status}`);

    const up1 = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(png, 'image/png', 'a.png') });
    const name1 = up1.data?.user?.profile_pic;
    if (name1) namesSeen.add(name1);
    assert(up1.status === 200 && up1.data?.success, 'PNG upload → 200', `got ${up1.status} ${up1.data?.message}`);
    assert(NAME.test(name1 || ''), 'the stored name is exactly 32 hex characters + .jpg');
    assert(name1 && !name1.includes(PARENT_LOGIN), 'the name carries no login id');
    assert(up1.data?.user?.login_id === PARENT_LOGIN && up1.data?.user?.must_change_password !== undefined, 'the reply is the /me user (login_id, must_change_password)');
    assert(!Object.keys(up1.data?.user || {}).some((k) => /password/i.test(k) && k !== 'must_change_password'), 'no password-shaped key in the reply');
    const me1 = await request('GET', '/api/auth/me', { token: parentToken });
    assert(me1.data?.user?.profile_pic === name1, 'GET /auth/me carries the same name');
    assert(fs.existsSync(path.join(AVATAR_DIR, name1 || 'x')), 'the file is on disk under uploads/avatars');

    const served1 = await fetchFile(`/uploads/avatars/${name1}`);
    const meta1 = served1.status === 200 ? await sharp(served1.buf).metadata() : {};
    assert(served1.status === 200, 'served at /uploads/avatars/<name> with no token', `got ${served1.status}`);
    assert((served1.headers.get('content-type') || '').startsWith('image/jpeg'), 'served as image/jpeg');
    assert(served1.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
    assert((served1.headers.get('cache-control') || '').includes('private'), 'Cache-Control is private');
    assert(meta1.format === 'jpeg' && meta1.width === 512 && meta1.height === 512, 'a PNG came back a 512 × 512 JPEG', `${meta1.format} ${meta1.width}x${meta1.height}`);

    console.log('\nReplace — EXIF and GPS stripped');
    const up2 = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(gpsJpeg, 'image/jpeg', 'b.jpg') });
    const name2 = up2.data?.user?.profile_pic;
    if (name2) namesSeen.add(name2);
    assert(up2.status === 200 && NAME.test(name2 || '') && name2 !== name1, 'JPEG replace → 200, a NEW name');
    const old = await fetchFile(`/uploads/avatars/${name1}`);
    assert(old.status === 404, 'the replaced photo’s address is dead (404)', `got ${old.status}`);
    assert(!fs.existsSync(path.join(AVATAR_DIR, name1)), 'and its file is gone from disk');
    const served2 = await fetchFile(`/uploads/avatars/${name2}`);
    const meta2 = await sharp(served2.buf).metadata();
    assert(meta2.width === 512 && meta2.height === 512, 'the 800 × 600 JPEG is cut to 512 × 512');
    assert(!meta2.exif && !hasGpsIfd(meta2.exif), 'NO EXIF at all in the stored photo — the GPS block is gone');
    assert(meta2.orientation === undefined, 'no orientation tag either (turned upright, not flagged)');

    const up3 = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(webp, 'image/webp', 'c.webp') });
    const name3 = up3.data?.user?.profile_pic;
    if (name3) namesSeen.add(name3);
    assert(up3.status === 200 && NAME.test(name3 || '') && name3 !== name2, 'WebP upload → 200, a new name');
    assert(!fs.existsSync(path.join(AVATAR_DIR, name2)), 'the previous file is gone');

    console.log('\nRefusals — nothing stored, nothing changed');
    const filesBefore = listAvatars();
    const textAsPng = await request('PUT', '/api/auth/photo', {
      token: parentToken,
      form: photoForm(Buffer.from('this is not an image at all'), 'image/png', 'not-really.png'),
    });
    assert(textAsPng.status === 400 && textAsPng.data?.message === 'Choose a JPEG, PNG or WebP image.', 'a text file named .png, typed image/png → 400, the type message', `got ${textAsPng.status}`);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).gif().toBuffer();
    const gifUp = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(gif, 'image/jpeg', 'x.jpg') });
    assert(gifUp.status === 400 && gifUp.data?.message === 'Choose a JPEG, PNG or WebP image.', 'a real GIF labelled .jpg → 400 (decoded, not trusted by name)');
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 7);
    const bigUp = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(big, 'image/jpeg', 'big.jpg') });
    assert(bigUp.status === 413 && bigUp.data?.message === 'The photo must be 5 MB or smaller.', '5 MB + 1 → 413, the size message', `got ${bigUp.status}`);
    const two = new FormData();
    two.append('photo', new Blob([png], { type: 'image/png' }), 'a.png');
    two.append('photo', new Blob([webp], { type: 'image/webp' }), 'b.webp');
    const twoUp = await request('PUT', '/api/auth/photo', { token: parentToken, form: two });
    assert(twoUp.status === 400 && twoUp.data?.message === 'Send one photo at a time.', 'two files → 400', `got ${twoUp.status}`);
    const wrongField = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(png, 'image/png', 'a.png', 'image') });
    assert(wrongField.status === 400, 'a file in another field → 400', `got ${wrongField.status}`);
    const noFile = await request('PUT', '/api/auth/photo', { token: parentToken, body: { photo: 'data' } });
    assert(noFile.status === 400 && noFile.data?.message === 'Choose a photo to upload.', 'a JSON body, no file → 400, the missing message', `got ${noFile.status}`);
    for (const r of [textAsPng, gifUp, bigUp, twoUp, wrongField, noFile]) {
      assert(r.data && r.data.success === false && typeof r.data.message === 'string', `refusal ${r.status} uses the uniform { success: false, message } body`);
    }
    const me3 = await request('GET', '/api/auth/me', { token: parentToken });
    assert(me3.data?.user?.profile_pic === name3, 'after six refusals the photo is unchanged');
    const filesAfter = listAvatars();
    assert(filesAfter.size === filesBefore.size && [...filesAfter].every((f) => filesBefore.has(f)), 'and no file was written by any refusal');

    console.log('\nThe mount');
    const root = await fetchFile('/uploads/');
    assert(root.status === 404, '/uploads/ lists nothing (404)', `got ${root.status}`);
    const dir = await fetchFile('/uploads/avatars/');
    assert(dir.status === 404, '/uploads/avatars/ lists nothing (404)', `got ${dir.status}`);
    const dot = await fetchFile('/uploads/.gitkeep');
    assert(dot.status !== 200, 'a dotfile is refused', `got ${dot.status}`);
    const guess = await fetchFile(`/uploads/avatars/${PARENT_LOGIN}.jpg`);
    assert(guess.status === 404, 'a login-id-shaped name is not a photo (404)');

    console.log('\nWhere the name appears');
    const adminView = await request('GET', `/api/users/${parentRow.id}`, { token: adminToken });
    assert(adminView.data?.user?.profile_pic === name3, 'GET /users/:id (admin) carries it');
    const pending = await request('GET', '/api/users/parents/pending', { token: adminToken });
    const pendingRows = pending.data?.parents || pending.data?.users || [];
    assert(pending.status === 200 && pendingRows.length > 0 && pendingRows.every((r) => 'profile_pic' in r), 'every pending-parent row has a profile_pic key', `keys: ${Object.keys(pending.data || {}).join(',')}`);
    const send = await request('POST', '/api/messages', { token: teacherToken, body: { receiver_id: parentRow.id, body: 'profile photo suite' } });
    messageId = send.data?.message?.id ?? send.data?.data?.id ?? null;
    if (!messageId) {
      const [[m]] = await db.query('SELECT id FROM messages WHERE sender_id = ? AND receiver_id = ? AND body = ? ORDER BY id DESC LIMIT 1', [teacherRow.id, parentRow.id, 'profile photo suite']);
      messageId = m ? m.id : null;
    }
    assert(send.status === 201 || send.status === 200, 'TCH-001 sends Marwin’s parent one message', `got ${send.status}`);
    const conv = await request('GET', '/api/messages/conversations', { token: teacherToken });
    const row = (conv.data?.conversations || []).find((c) => c.other_user_id === parentRow.id);
    assert(row && row.other_user_profile_pic === name3, 'the teacher’s conversation row carries other_user_profile_pic');

    console.log('\nOwn account only — the teacher’s upload touches nobody else');
    const tUp = await request('PUT', '/api/auth/photo', { token: teacherToken, form: photoForm(png, 'image/png', 't.png') });
    const tName = tUp.data?.user?.profile_pic;
    if (tName) namesSeen.add(tName);
    assert(tUp.status === 200 && tUp.data?.user?.login_id === 'TCH-001' && NAME.test(tName || ''), 'TCH-001 uploads their own');
    const meAgain = await request('GET', '/api/auth/me', { token: parentToken });
    assert(meAgain.data?.user?.profile_pic === name3, 'the parent’s photo is untouched');
    const tDel = await request('DELETE', '/api/auth/photo', { token: teacherToken });
    assert(tDel.status === 200 && tDel.data?.user?.profile_pic === null && !fs.existsSync(path.join(AVATAR_DIR, tName)), 'TCH-001 removes their own: NULL, file gone');

    console.log('\nAdmin — remove only');
    const tryTeacher = await request('DELETE', `/api/users/${parentRow.id}/photo`, { token: teacherToken });
    assert(tryTeacher.status === 403, 'a teacher → 403', `got ${tryTeacher.status}`);
    const tryParent = await request('DELETE', `/api/users/${parentRow.id}/photo`, { token: parentToken });
    assert(tryParent.status === 403, 'a parent → 403', `got ${tryParent.status}`);
    const badId = await request('DELETE', '/api/users/abc/photo', { token: adminToken });
    assert(badId.status === 400, 'a bad id → 400', `got ${badId.status}`);
    const unknown = await request('DELETE', '/api/users/99999999/photo', { token: adminToken });
    assert(unknown.status === 404, 'an unknown id → 404', `got ${unknown.status}`);
    const noUpload = await request('PUT', `/api/users/${parentRow.id}/photo`, { token: adminToken, form: photoForm(png, 'image/png', 'a.png') });
    assert(noUpload.status === 404, 'there is no admin UPLOAD for someone else (no such route)', `got ${noUpload.status}`);
    const aDel = await request('DELETE', `/api/users/${parentRow.id}/photo`, { token: adminToken });
    assert(aDel.status === 200 && aDel.data?.success, 'admin removes the parent’s photo → 200');
    const meGone = await request('GET', '/api/auth/me', { token: parentToken });
    assert(meGone.data?.user?.profile_pic === null, 'the parent’s /me now has profile_pic null');
    assert(!fs.existsSync(path.join(AVATAR_DIR, name3)), 'the file is gone');
    const gone = await fetchFile(`/uploads/avatars/${name3}`);
    assert(gone.status === 404, 'its address is dead');
    const aAgain = await request('DELETE', `/api/users/${parentRow.id}/photo`, { token: adminToken });
    assert(aAgain.status === 200 && aAgain.data?.message === 'This account has no profile photo.', 'again → 200, a no-op');

    console.log('\nOwn removal');
    const up4 = await request('PUT', '/api/auth/photo', { token: parentToken, form: photoForm(png, 'image/png', 'd.png') });
    const name4 = up4.data?.user?.profile_pic;
    if (name4) namesSeen.add(name4);
    const del = await request('DELETE', '/api/auth/photo', { token: parentToken });
    assert(del.status === 200 && del.data?.user?.profile_pic === null && del.data?.message === 'Profile photo removed.', 'DELETE /auth/photo → 200, the /me user with profile_pic null');
    assert(name4 && !fs.existsSync(path.join(AVATAR_DIR, name4)), 'the file is gone');
    const delAgain = await request('DELETE', '/api/auth/photo', { token: parentToken });
    assert(delAgain.status === 200 && delAgain.data?.message === 'There was no profile photo to remove.', 'again → 200, a no-op');

    console.log('\nactivity_logs — actions logged, no id, no login id, no file name');
    const [logs] = await db.query(
      "SELECT action, description FROM activity_logs WHERE id > ? AND action IN ('upload_profile_photo', 'remove_profile_photo', 'admin_remove_profile_photo')",
      [maxLog]
    );
    const count = (a) => logs.filter((l) => l.action === a).length;
    assert(count('upload_profile_photo') === 5, 'five upload rows (4 parent + 1 teacher)', `got ${count('upload_profile_photo')}`);
    assert(count('remove_profile_photo') === 2, 'two own-removal rows (the no-op writes none)', `got ${count('remove_profile_photo')}`);
    assert(count('admin_remove_profile_photo') === 1, 'one admin-removal row (the no-op writes none)', `got ${count('admin_remove_profile_photo')}`);
    const leaks = logs.filter((l) => {
      const d = l.description || '';
      return d.includes(PARENT_LOGIN) || /#\d/.test(d) || /\b\d{3,}\b/.test(d) || [...namesSeen].some((n) => d.includes(n.slice(0, 8)));
    });
    assert(leaks.length === 0, 'no description carries a login id, an id or a file name', `${leaks.length} leaked`);
  } finally {
    // Cleanup by what this run touched, then proof that nothing is left.
    await db.query('UPDATE users SET profile_pic = ? WHERE id = ?', [startParentPic, parentRow.id]);
    await db.query('UPDATE users SET profile_pic = ? WHERE id = ?', [startTeacherPic, teacherRow.id]);
    if (messageId) await db.query('DELETE FROM messages WHERE id = ?', [messageId]);
    for (const f of listAvatars()) {
      if (!startFiles.has(f)) fs.unlinkSync(path.join(AVATAR_DIR, f));
    }
    const endFiles = listAvatars();
    const [[p]] = await db.query('SELECT profile_pic FROM users WHERE id = ?', [parentRow.id]);
    const [[t]] = await db.query('SELECT profile_pic FROM users WHERE id = ?', [teacherRow.id]);
    const [[{ remaining }]] = await db.query('SELECT COUNT(*) AS remaining FROM messages WHERE body = ?', ['profile photo suite']);
    console.log('\nCleanup');
    assert(endFiles.size === startFiles.size && [...endFiles].every((f) => startFiles.has(f)), 'ZERO leftover files: uploads/avatars is exactly as it was');
    assert(p.profile_pic === startParentPic && t.profile_pic === startTeacherPic, 'both accounts’ profile_pic are back (NULL on the baseline)');
    assert(Number(remaining) === 0, 'the suite’s message is gone');
    await policy.cleanup();
    await db.end();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
