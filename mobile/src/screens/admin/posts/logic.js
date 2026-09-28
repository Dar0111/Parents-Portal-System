import { staffAudienceLabel } from '../../../format/audience';

// THE PURE HALF OF THE WEB'S admin/AnnouncementsPage.jsx (Stage 5 branch 4),
// lifted so scripts/proof-admin-posts.mjs can drive it. Each rule is the
// web's; only the file moved.

export const EMPTY_ANN = Object.freeze({ audience: 'school', grade: '', section: '', title: '', content: '', category: '' });
export const EMPTY_MEMO = Object.freeze({ title: '', content: '' });
export const EMPTY_FILTER = Object.freeze({ grade: '', section: '' });

export const AUDIENCES = [
  { key: 'school', label: 'Everyone at the school' },
  { key: 'grade', label: 'One whole grade' },
  { key: 'class', label: 'One class' },
];

export function formFromRow(row) {
  return {
    audience: row.target_grade === null ? 'school' : row.target_section ? 'class' : 'grade',
    grade: row.target_grade === null ? '' : String(row.target_grade),
    section: row.target_section || '',
    title: row.title || '',
    content: row.content || '',
    category: row.category || '',
  };
}

// THE ANNOUNCEMENT BODY, or the refusal. PUT KEEPS A FIELD'S OLD VALUE WHEN
// ITS KEY IS OMITTED (content.js), so "I cleared the section" and "I sent
// target_section: null" are opposite requests: EVERY write sends BOTH target
// keys, null when absent. School-wide = both null; one grade = grade only;
// one class = both. The admin section is not checked server-side against
// `sections`, so the class always comes from GET /sections, never typed.
export function announcementBody(form) {
  const title = form.title.trim();
  const content = form.content.trim();
  if (!title || !content) return { problem: 'Title and message are required.' };
  if (form.audience !== 'school' && !form.grade) return { problem: 'Pick a grade.' };
  if (form.audience === 'class' && !form.section) return { problem: 'Pick a class.' };
  return {
    body: {
      title,
      content,
      category: form.category.trim() || null,
      target_grade: form.audience === 'school' ? null : Number(form.grade),
      target_section: form.audience === 'class' ? form.section : null,
    },
  };
}

export function memoBody(form) {
  const title = form.title.trim();
  const content = form.content.trim();
  if (!title || !content) return { problem: 'Title and message are required.' };
  return { body: { title, content } };
}

// Who will see it, said before posting (§5i).
export function audienceHint(form) {
  if (form.audience === 'school') return 'Every teacher and every parent will see this.';
  if (form.audience === 'grade') {
    return form.grade
      ? `Every parent with a child in Grade ${form.grade}, and every teacher who teaches or advises a class in Grade ${form.grade}.`
      : 'Pick a grade.';
  }
  if (!form.grade || !form.section) return 'Pick a grade, then a class.';
  return `Parents of Grade ${form.grade} - ${form.section}, and the teachers who teach or advise that class.`;
}

// EDIT ONLY YOUR OWN; DELETE ANY. An admin PUT keeps the original author, so
// editing a teacher's post would put new words under that teacher's name.
// Every memo is an admin's, so a memo is always editable here.
export function canEditAnnouncement(row, meId) {
  return row?.posted_by === meId;
}

// THE DELETE SENTENCE — the web's, naming the post and, for a teacher's
// announcement, the teacher who is NOT told (§5e: a hard delete, no restore).
export function deleteSentence(kind, row, meId) {
  if (kind === 'memo') return `Delete “${row.title}”? This cannot be undone. Every teacher and parent loses it.`;
  const own = row.posted_by === meId;
  return `Delete “${row.title}”, posted by ${own ? 'you' : row.posted_by_name} to ${staffAudienceLabel(row)}? This cannot be undone. Parents who have not read it will never see it${own ? '.' : `, and ${row.posted_by_name} is not told.`}`;
}

export function announcementFilterParams(filter) {
  const params = {};
  if (filter.grade) params.grade_level = filter.grade;
  if (filter.section) params.section = filter.section;
  return params;
}
