import Avatar from '../../components/Avatar';

// THE PROFILE HERO (feat/ui-refresh, 2026-10-02) — the band at the top of the
// TEACHER and ADMIN dashboards: who is signed in, and a few facts about the
// day. The staff counterpart of the parent's "Your child" hero, on the same
// `brand-panel` surface for the same reason (it is a solid field in both
// themes, where `primary` is a button fill).
//
// IT FETCHES NOTHING AND DECIDES NOTHING. `user` is the session's own
// (`useAuth`), and `facts` is a list the DASHBOARD builds from requests it
// already makes for its cards — a fact is simply absent until the card data
// behind it has arrived, so there is no spinner here and no second copy of a
// number that could disagree with the card below it. No link either: the
// sidebar's user card is the way to Account information.
//
// THE ROLE LINE FOLLOWS THE SIDEBAR USER CARD'S RULE (layout/Shell.jsx):
// staff read "Teacher · <login id>"; A PARENT'S LOGIN ID IS NEVER SHOWN,
// because it is the child's LRN (§5c) — not as the detail and not as the
// name fallback. No parent screen renders this component today; the rule is
// kept here anyway so that reusing it cannot leak one.
//
// NOTHING IN HERE IS `primary`, AND NOTHING IS RED.
//
// THE LOOK (build 2, feat/dashboards-look, 2026-10-07 — the owner's Part C):
// the container corner (`rounded-xl`, §27f) and NO SHADOW; the facts are ONE
// LINE of `text-sm text-brand-panel-muted`, joined by " · " — the same
// muted line the role detail already uses, a pair lint:contrast checks
// (7.03:1 light, 10.08:1 dark) — not a row of pills. A fact's `icon` is no
// longer drawn; the words carry it. The line wraps at a space on a phone.
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

export default function ProfileHero({ user, facts = [] }) {
  const isParent = user?.role === 'parent';
  const role = ROLE_LABEL[user?.role] || user?.role || '';
  const detail = isParent ? role : [role, user?.login_id].filter(Boolean).join(' · ');
  const name = user?.name || (isParent ? '' : user?.login_id) || '';
  const shown = facts.filter((fact) => fact && fact.label);

  return (
    <section className="brand-panel-art rounded-xl border border-edge bg-brand-panel p-5 text-brand-panel-fg sm:p-6">
      <div className="flex items-center gap-4">
        {/* A photo when the account has one, initials otherwise — Avatar's own
            rule, its own fallback when the file is gone, and its own hairline
            ring (no ring class is passed in: two would fight). */}
        <Avatar name={name} photo={user?.profile_pic} size="lg" />
        <div className="min-w-0">
          {name ? <h2 className="break-words font-serif text-xl font-bold sm:text-2xl">{name}</h2> : null}
          {detail ? <p className="mt-1 text-sm text-brand-panel-muted">{detail}</p> : null}
        </div>
      </div>
      {shown.length ? (
        <p className="mt-4 text-sm text-brand-panel-muted">{shown.map((fact) => fact.label).join(' · ')}</p>
      ) : null}
    </section>
  );
}
