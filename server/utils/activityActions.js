// THE ACTIVITY LOG'S WORDS (feat/activity-log, B2): every action code
// `activity_logs` holds, its English label and its group. ONE place — the
// list, the CSV and the filter's options all read it, so no client keeps a
// copy (the owner's answer to the plan's P4).
//
// EACH LABEL READS ON ITS OWN (the owner's C1): the page shows no group
// column, so "Submitted an excuse letter", never "Submitted". A code that is
// no longer written keeps a label ending "(removed)", because its rows stay.
// The one reset of old rows (D-122, docs/ACTIVITY_RESET.md) keeps those rows
// too, and no route cleans activity_logs.
//
// A CODE THAT IS NOT HERE IS NOT AN ERROR: its row shows the code itself as
// the label, in the group Other, so a new writer that forgot this file still
// lists. `test:activity-log` reads every logActivity call in server/routes and
// server/utils and fails until the code is added.
//
// WHAT IS NEVER HERE: the description. A template can hold a typed title, a
// person's name, a setting's value, and before 2026-09-18 an LRN; the page and
// the CSV carry none of it (the owner's Q1 (a)).

const GROUPS = [
  {
    key: 'account',
    label: 'Sign-in and account',
    actions: [
      ['login', 'Signed in'],
      ['login_failed', 'Sign-in failed'],
      ['change_password', 'Changed password'],
      ['password_reset_requested', 'Asked for a password reset code'],
      ['password_reset', 'Reset password with a code'],
      ['password_reset_email_failed', 'Reset code email not sent'],
      ['password_reset_sms_failed', 'Reset code text not sent'],
      ['email_verification_requested', 'Asked for an email confirmation code'],
      ['email_verified', 'Confirmed email address'],
      ['contact_verification_requested', 'Asked for a mobile confirmation code'],
      ['contact_verification_sms_failed', 'Mobile confirmation code text not sent'],
      ['contact_verified', 'Confirmed mobile number'],
      ['update_contact', 'Updated mobile number'],
      ['update_email', 'Updated email address'],
      ['upload_profile_photo', 'Uploaded profile photo'],
      ['remove_profile_photo', 'Removed profile photo'],
      ['accept_policy', 'Accepted the privacy notice and terms'],
      ['password_alert_sent', 'Password-change alert sent'],
      ['password_alert_not_sent', 'Password-change alert not sent (no confirmed contact)'],
      ['password_alert_email_failed', 'Password-change alert email not sent'],
      ['password_alert_sms_failed', 'Password-change alert text not sent'],
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    actions: [
      ['create_teacher', 'Created a teacher account'],
      ['create_parent', 'Created a parent account'],
      ['approve_parent', 'Approved a parent account'],
      ['reject_parent', 'Rejected a parent account'],
      ['update_user', 'Edited an account'],
      ['update_user_status', "Changed an account's status"],
      ['admin_temp_password', 'Set a temporary password'],
      ['admin_remove_profile_photo', "Removed someone's profile photo"],
    ],
  },
  {
    key: 'learners',
    label: 'Learners',
    actions: [
      ['create_student', 'Enrolled a learner'],
      ['update_student', "Edited a learner's record"],
      ['update_student_status', "Changed a learner's status"],
    ],
  },
  {
    key: 'classes',
    label: 'Classes',
    actions: [
      ['create_assignment', 'Assigned a subject teacher'],
      ['delete_assignment', 'Removed a subject assignment'],
      ['update_section_adviser', "Changed a section's adviser"],
    ],
  },
  {
    key: 'grades',
    label: 'Grades',
    actions: [
      ['create_grade', 'Created a grade record'],
      ['record_grade_component', 'Added a score'],
      ['update_grade_component', 'Edited a score'],
      ['delete_grade_component', 'Deleted a score'],
      ['record_grade_exam', 'Recorded exam scores'],
      ['save_class_record', 'Saved a class record'],
      ['update_grade_lock', 'Locked or unlocked a grade'],
      ['bulk_grade_lock', "Locked a term's grades"],
      ['bulk_grade_unlock', "Unlocked a term's grades"],
      ['delete_grade', 'Deleted a grade record'],
      ['acknowledge_grades', "Confirmed a term's grades"],
      ['grade_acknowledgement_cleared', 'Cleared a parent confirmation by unlocking'],
      ['record_descriptive_grade', 'Set a Grade 1 letter (removed)'],
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    actions: [
      ['record_attendance', 'Recorded attendance'],
      ['bulk_record_attendance', "Recorded a class's attendance"],
      ['correct_attendance', 'Corrected attendance'],
      ['excuse_attendance', 'Attendance set by an excuse decision'],
    ],
  },
  {
    key: 'excuse_letters',
    label: 'Excuse letters',
    actions: [
      ['submit_excuse_letter', 'Submitted an excuse letter'],
      ['update_excuse_letter', 'Edited an excuse letter'],
      ['review_excuse_letter', 'Reviewed an excuse letter'],
    ],
  },
  {
    key: 'posts',
    label: 'Posts',
    actions: [
      ['create_announcement', 'Posted an announcement'],
      ['update_announcement', 'Edited an announcement'],
      ['delete_announcement', 'Deleted an announcement'],
      ['create_memo', 'Posted a memo'],
      ['update_memo', 'Edited a memo'],
      ['delete_memo', 'Deleted a memo'],
      ['create_event', 'Posted an event'],
      ['update_event', 'Edited an event'],
      ['delete_event', 'Deleted an event'],
    ],
  },
  {
    key: 'messages',
    label: 'Messages',
    actions: [
      ['send_message', 'Sent a message'],
      ['read_message', 'Read a message'],
      ['read_all_messages', 'Read a conversation'],
    ],
  },
  {
    key: 'system',
    label: 'System',
    actions: [
      ['update_setting', 'Changed a setting'],
      ['update_settings_bulk', 'Changed settings'],
      ['create_backup', 'Made a backup'],
      ['download_backup', 'Downloaded a backup'],
      ['delete_backup', 'Deleted a backup'],
      ['restore_backup', 'Restored a backup'],
      ['restore_refused', 'Restore refused'],
      ['restore_wiped_activity_logs', 'A restore rewound this log'],
      ['export_activity_log', 'Downloaded the activity log'],
      // Written by scripts/setup-db.js and scripts/migrate-fixture-learner.js,
      // never by a route.
      ['seed', 'Database setup by a script'],
      // Written by scripts/demo-*.js and scripts/activity-reset.js, never by a
      // route: each is one row for a bulk write straight to the tables.
      ['demo_data_load', 'Loaded the demo data'],
      ['demo_data_undo', 'Removed the demo data'],
      ['demo_messages_clear', 'Cleared the messages before the demo data'],
      ['demo_passwords_set', 'Set the demo passwords'],
      ['activity_log_reset', 'Reset the activity log'],
    ],
  },
  {
    key: 'removed',
    label: 'Removed features',
    actions: [
      // Contribution/Fees Monitoring, removed 2026-09-13 (CLAUDE.md → SCOPE
      // DECISION). Its 40 rows stay as history.
      ['create_contribution', 'Posted a contribution (removed)'],
      ['update_contribution', 'Edited a contribution (removed)'],
      ['delete_contribution', 'Deleted a contribution (removed)'],
      ['update_contribution_record', 'Marked a contribution payment (removed)'],
    ],
  },
];

const OTHER_GROUP = Object.freeze({ key: 'other', label: 'Other' });

const ACTION_GROUPS = Object.freeze(
  GROUPS.map((g) =>
    Object.freeze({
      key: g.key,
      label: g.label,
      actions: Object.freeze(g.actions.map(([code, label]) => Object.freeze({ code, label }))),
    })
  )
);

const BY_CODE = new Map();
for (const g of ACTION_GROUPS) for (const a of g.actions) BY_CODE.set(a.code, { label: a.label, group: g.key });

// { label, group } for any code — an unknown one is its own label, in Other.
function actionInfo(code) {
  return BY_CODE.get(code) || { label: String(code), group: OTHER_GROUP.key };
}

// The codes of one group, or null for a key that names none. `other` is not a
// list: it is every code NOT in the map, which only the database knows.
function groupCodes(key) {
  const g = ACTION_GROUPS.find((x) => x.key === key);
  return g ? g.actions.map((a) => a.code) : null;
}

function groupLabel(key) {
  if (key === OTHER_GROUP.key) return OTHER_GROUP.label;
  return ACTION_GROUPS.find((x) => x.key === key)?.label || String(key);
}

function knownCodes() {
  return [...BY_CODE.keys()];
}

module.exports = { ACTION_GROUPS, OTHER_GROUP, actionInfo, groupCodes, groupLabel, knownCodes };
