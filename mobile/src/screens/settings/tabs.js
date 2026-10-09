// The Settings tabs per role — a plain module, not exported from the layout
// component, so SettingsLayout.jsx stays a component-only file (oxlint
// react/only-export-components) and a test can read the lists without
// rendering.
//
// Relative `to` values resolve against the /<role>/settings layout route:
// '' is the index tab. Admin's index is School settings (the former admin
// page, unchanged); teacher's and parent's is Account information.

const ACCOUNT = { to: '', label: 'Account information', icon: 'fa-id-card' };
const PASSWORD = { to: 'password', label: 'Change password', icon: 'fa-key' };
const PERSONALIZATION = { to: 'personalization', label: 'Personalization', icon: 'fa-sliders' };
// The Data Privacy Notice and the Terms of Use, and when this user accepted
// each (feat/privacy, 2026-10-10) — every role.
const SECURITY = { to: 'security', label: 'Security & policy', icon: 'fa-shield-halved' };

const TABS_BY_ROLE = {
  teacher: [ACCOUNT, PASSWORD, SECURITY, PERSONALIZATION],
  parent: [ACCOUNT, PASSWORD, SECURITY, PERSONALIZATION],
  admin: [
    { to: '', label: 'School settings', icon: 'fa-school' },
    { ...ACCOUNT, to: 'account' },
    PASSWORD,
    SECURITY,
    PERSONALIZATION,
  ],
};

export function settingsTabsForRole(role) {
  return TABS_BY_ROLE[role] || [];
}
