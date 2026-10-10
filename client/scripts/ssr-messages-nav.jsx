// PROOF — fix round on feat/shared-messages (2026-10-11): the owner's device
// check findings W1 and W2 (FRONTEND §30).
//
// W1 — a way back that is always visible: a ← in the top bar, before the
//   title, on the Messages thread pages only. Header.jsx is rendered with and
//   without `back`; then, SOURCE TEXT said plainly, the wiring a render cannot
//   show: the thread hands the bar its own `listPath` through usePageBack, no
//   other file calls it, only the thread routes render the thread, and Shell
//   carries the value from its provider to Header. Since fix round 2 the ←
//   is THE way back: handed over before the loading return, and the thread
//   page has no "All conversations" link of its own (W1.9).
// W2 — a whole row opens the conversation: DataTable is rendered with and
//   without `onRowClick`; the row's handler (`openRowOnClick`, read from
//   DataTable.jsx) is RUN on fake clicks — on a cell, on Open, on the icon
//   inside Open, on a link, after a text drag; and the source says only the
//   Messages lists pass the prop, to the path Open and the card already use.
//
// EVERY CHECK HAS A NEGATIVE CONTROL: the same predicate on the render without
// the prop, or on an in-memory copy of a source with the fact broken, must
// fail — a check that cannot fail proves nothing.
//
// WHAT IT CANNOT: the layout effect that sets and clears the ← (an SSR render
// runs no effects), a real click in a real browser, the sticky bar over a
// scrolled thread — the owner's device check.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-messages-nav.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-messages-nav.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Header from '../src/layout/Header';
import DataTable from '../src/components/DataTable';
import { buttonClass } from '../src/components/buttonClass';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
// One check: the predicate holds on the real input and FAILS on every control.
function proved(label, holds, real, ...controls) {
  const onReal = Boolean(holds(real));
  const caught = controls.map((c) => !holds(c));
  assert(
    onReal && caught.every(Boolean),
    label,
    `real ${onReal ? 'holds' : 'DOES NOT HOLD'}; controls ${caught.map((c) => (c ? 'fail' : 'DO NOT FAIL')).join(', ')}`
  );
}

const SRC = path.resolve('src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
// Every module under src/, keyed by its path from src/ with forward slashes.
const files = Object.fromEntries(
  fs
    .readdirSync(SRC, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.(js|jsx)$/.test(f))
    .map((f) => [f, read(f)])
);
const withFile = (rel, text) => ({ ...files, [rel]: text });
const callers = (map, re) => Object.keys(map).filter((f) => re.test(map[f])).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const THREAD = 'pages/messages/MessageThread.jsx';
const LIST = 'pages/messages/ConversationsPage.jsx';
const WRAPPERS = ['pages/parent/MessageThreadPage.jsx', 'pages/teacher/MessageThreadPage.jsx'];
const LISTS = ['pages/parent/MessagesPage.jsx', 'pages/teacher/MessagesPage.jsx'];

// ---------------------------------------------------------------------------
console.log('W1 — the top bar, rendered');
const bar = (back) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Header title="Ana Reyes" back={back} onOpenMenu={() => {}} />
    </MemoryRouter>
  );
const withBack = bar({ to: '/admin/messages', label: 'All conversations' });
const without = bar(null);
const headerTag = (m) => (m.match(/<header [^>]*>/) || [''])[0];
const h1 = (m) => (m.match(/<h1 [^>]*>[^<]*<\/h1>/) || [''])[0];
const backLink = (m) => {
  const at = m.indexOf('aria-label="All conversations"');
  if (at < 0) return null;
  const open = m.lastIndexOf('<a ', at);
  const close = m.indexOf('</a>', at);
  return open < 0 || close < 0 ? null : { tag: m.slice(open, m.indexOf('>', open) + 1), body: m.slice(open, close), at: open };
};

proved(
  'W1.1 with `back`, a link to the list named "All conversations", an arrow, before the <h1>',
  (m) => {
    const link = backLink(m);
    return (
      link &&
      link.tag.includes('href="/admin/messages"') &&
      link.body.includes('fa-arrow-left') &&
      link.body.includes('aria-hidden="true"') &&
      link.at < m.indexOf('<h1')
    );
  },
  withBack,
  without
);
proved(
  'W1.2 the ← is the shared ghost icon button (44px square)',
  (m) => {
    const link = backLink(m);
    return link && link.tag.includes(`class="${buttonClass({ variant: 'ghost', size: 'icon' })}"`) && /\bh-11 w-11\b/.test(link.tag);
  },
  withBack,
  without
);
proved(
  'W1.3 without `back` the bar has no ← at all',
  (m) => !m.includes('fa-arrow-left') && !m.includes('All conversations') && !/<a /.test(headerTag(m) + m.slice(m.indexOf('<header'), m.indexOf('<h1'))),
  without,
  withBack
);
proved(
  'W1.4 the bar keeps its 4rem height and its <h1>, with the ← and without',
  ([a, b]) => headerTag(a) !== '' && headerTag(a) === headerTag(b) && /\bh-16\b/.test(headerTag(a)) && h1(a) !== '' && h1(a) === h1(b),
  [withBack, without],
  [withBack, without.replace(' h-16 ', ' h-20 ')],
  [withBack, without.replace('Ana Reyes', 'Messages')]
);

// ---------------------------------------------------------------------------
console.log('W1 — only the thread pages hand the bar a way back (source text)');
// Fix round 2: the ← is THE way back, so it must be there in every state of
// the thread — handed over at the component's top level (two-space indent,
// never inside a branch) and BEFORE the loading return, which is also the
// state a 403 leaves standing.
const CALL = "  usePageBack(listPath, 'All conversations');";
const onlyThreadCalls = (map) => {
  const who = callers(map, /\busePageBack\(/).filter((f) => f !== 'layout/usePageBack.js');
  const thread = map[THREAD] || '';
  const call = thread.indexOf(`\n${CALL}\n`);
  return same(who, [THREAD]) && call > 0 && call < thread.indexOf('if (loading) return');
};
proved(
  'W1.5 usePageBack is called by MessageThread alone, with its listPath, before the loading return (loading and 403 keep the ←)',
  onlyThreadCalls,
  files,
  withFile(LIST, `${files[LIST]}\n// usePageBack(base, 'All conversations');\n`),
  withFile(THREAD, files[THREAD].replace("usePageBack(listPath, 'All conversations');", "usePageBack('/parent/messages', 'All conversations');")),
  withFile(THREAD, files[THREAD].replace(`\n${CALL}\n`, '\n').replace('if (loading) return', `if (loading) return null;\n${CALL}\n  if (loading) return`))
);
const threadOnlyOnRoutes = (map) => {
  const importers = callers(map, /from '(\.\.\/messages|\.)\/MessageThread'/).filter((f) => f !== THREAD);
  const app = map['App.jsx'] || '';
  const routeLines = app.split('\n').filter((l) => /<(Parent|Teacher)MessageThread \/>/.test(l));
  return same(importers, WRAPPERS) && routeLines.length === 3 && routeLines.every((l) => l.includes('path="messages/:userId"'));
};
proved(
  'W1.6 the thread is rendered only by the two thread wrappers, and they only on messages/:userId',
  threadOnlyOnRoutes,
  files,
  withFile('pages/teacher/StudentsPage.jsx', `import MessageThread from '../messages/MessageThread';\n${files['pages/teacher/StudentsPage.jsx'] || ''}`),
  withFile('App.jsx', (files['App.jsx'] || '').replace('path="messages/:userId" element={<TeacherMessageThread />}', 'path="students/:id" element={<TeacherMessageThread />}'))
);
const shellWired = (shell) =>
  /const \[back, setBack\] = useState\(null\);/.test(shell) &&
  /const backContext = useMemo\(\(\) => \(\{ setBack \}\), \[\]\);/.test(shell) &&
  /<Header\s+title=\{title\}\s+back=\{back\}/.test(shell) &&
  /<PageBackContext\.Provider value=\{backContext\}>\s*<Outlet \/>\s*<\/PageBackContext\.Provider>/.test(shell);
proved(
  'W1.7 Shell provides the setter around <Outlet /> and passes `back` to Header',
  shellWired,
  files['layout/Shell.jsx'],
  files['layout/Shell.jsx'].replace('back={back}', ''),
  files['layout/Shell.jsx'].replace('<PageBackContext.Provider value={backContext}>', '<PageBackContext.Provider value={null}>')
);
const hookClears = (hook) =>
  /useLayoutEffect\(\(\) => \{\s*if \(!setBack \|\| !to\) return undefined;\s*setBack\(\{ to, label \}\);\s*return \(\) => setBack\(null\);\s*\}, \[setBack, to, label\]\);/.test(hook);
proved(
  'W1.8 the hook sets the ← only with a target and clears it when the page goes (a layout effect)',
  hookClears,
  files['layout/usePageBack.js'],
  files['layout/usePageBack.js'].replace('return () => setBack(null);', ''),
  files['layout/usePageBack.js'].replace('useLayoutEffect(() => {', 'useEffect(() => {')
);
// Fix round 2: the thread page (the shared thread and both wrappers, CODE
// only — comments may say what is gone) has no link of its own: no <Link>, no
// `to={listPath}`, no arrow, and "All conversations" only as the ←'s name.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const noOwnLink = (map) => {
  const code = [THREAD, ...WRAPPERS].map((f) => stripComments(map[f] || '')).join('\n');
  return (
    !/<Link\b/.test(code) &&
    !/to=\{listPath\}/.test(code) &&
    !/fa-arrow-left/.test(code) &&
    (code.match(/All conversations/g) || []).length === 1 &&
    code.includes(CALL)
  );
};
proved(
  'W1.9 the thread page renders no "All conversations" link of its own — the ← is the way back',
  noOwnLink,
  files,
  withFile(THREAD, `${files[THREAD]}\nconst back = <Link to={listPath}><i className="fa-solid fa-arrow-left" />All conversations</Link>;\n`),
  withFile(WRAPPERS[1], `${files[WRAPPERS[1]]}\nconst back = <Link to="/teacher/messages">All conversations</Link>;\n`)
);

// ---------------------------------------------------------------------------
console.log('W2 — the table, rendered');
const ROWS = [{ id: 1, name: 'Ana Reyes' }, { id: 2, name: 'Grade 1 teacher' }];
const COLUMNS = [
  { key: 'name', header: 'Conversation' },
  { key: 'open', header: '', render: () => <button type="button">Open</button> },
];
const table = (extra) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <DataTable columns={COLUMNS} rows={ROWS} {...extra} />
    </MemoryRouter>
  );
const clickable = table({ onRowClick: () => {} });
const plain = table({});
const OLD_ROW = 'border-b border-edge-soft transition-colors last:border-0 hover:bg-surface-subtle';
const bodyRows = (m) => m.slice(m.indexOf('<tbody'), m.indexOf('</tbody>')).match(/<tr [^>]*>/g) || [];
const headRows = (m) => m.slice(m.indexOf('<thead'), m.indexOf('</thead>')).match(/<tr [^>]*>/g) || [];

proved(
  'W2.1 with `onRowClick`, every body row shows the pointer; the header row does not',
  (m) => bodyRows(m).length === ROWS.length && bodyRows(m).every((r) => r.includes('cursor-pointer')) && headRows(m).every((r) => !r.includes('cursor-pointer')),
  clickable,
  plain
);
proved(
  'W2.2 without it, every row is exactly the row it was (every other list)',
  (m) => bodyRows(m).length === ROWS.length && bodyRows(m).every((r) => r === `<tr class="${OLD_ROW}">`) && !m.includes('cursor-pointer'),
  plain,
  clickable
);
proved(
  'W2.3 the Open cell and the rest of the markup are the same with and without it',
  ([a, b]) => a.replaceAll(' cursor-pointer', '') === b && a.includes('<button type="button">Open</button>'),
  [clickable, plain],
  [clickable.replace('<button type="button">Open</button>', '<span>Open</span>'), plain]
);
const card = (to) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <DataTable columns={COLUMNS} rows={ROWS.slice(0, 1)} renderCard={(r) => ({ to, title: r.name })} onRowClick={() => {}} />
    </MemoryRouter>
  );
proved(
  'W2.4 at narrow widths the card is already one link to the thread (no row handler needed)',
  (m) => /<div class="sm:hidden"><a class="[^"]*" href="\/teacher\/messages\/1"[^>]*>/.test(m),
  card('/teacher/messages/1'),
  card(undefined)
);

// ---------------------------------------------------------------------------
console.log("W2 — the row's handler, run on fake clicks (read from DataTable.jsx)");
const tableSrc = files['components/DataTable.jsx'];
const fnSrc = (tableSrc.match(/function openRowOnClick\(event, row, onRowClick\) \{\n[\s\S]*?\n\}\n/) || [''])[0];
const controlsList = (tableSrc.match(/const ROW_CONTROLS = '([^']+)';/) || [])[1] || '';
const TR_WIRING = 'onClick={onRowClick ? (event) => openRowOnClick(event, row, onRowClick) : undefined}';
proved(
  'W2.5 the body <tr> calls openRowOnClick, and only when the page passes onRowClick',
  (src) => src.includes(TR_WIRING) && fnSrc !== '' && controlsList !== '',
  tableSrc,
  tableSrc.replace(TR_WIRING, 'onClick={(event) => openRowOnClick(event, row, onRowClick)}')
);

// A target and its ancestors, by tag; closest() answers from the selector list.
const target = (...chain) => ({ closest: (sel) => (chain.some((t) => sel.split(',').map((s) => s.trim()).includes(t)) ? {} : null) });
const fakeWindow = { selected: '', getSelection() { return { toString: () => this.selected }; } };
const handlerFrom = (src) => {
  try {
    return new Function('ROW_CONTROLS', 'window', `${src}\nreturn openRowOnClick;`)(controlsList, fakeWindow);
  } catch {
    return null;
  }
};
// How many times one click navigates: the row's handler, plus Open's own
// onClick when the click lands on (or inside) Open, as ConversationsPage has it.
function navigations(handler, chain, selected = '') {
  if (!handler) return -1;
  let count = 0;
  fakeWindow.selected = selected;
  if (chain.includes('button')) count += 1; // Open's own navigate
  handler({ target: target(...chain) }, ROWS[0], () => {
    count += 1;
  });
  fakeWindow.selected = '';
  return count;
}
const real = handlerFrom(fnSrc);
const noCall = handlerFrom(fnSrc.replace('onRowClick(row);', ''));
const noGuard = handlerFrom(fnSrc.replace('if (event.target.closest(ROW_CONTROLS)) return;', ''));
const noSelection = handlerFrom(fnSrc.replace('if (window.getSelection()?.toString()) return;', ''));

proved(
  'W2.6 a click anywhere else on the row (a cell, its text, the avatar) opens it, once',
  (h) => [['td', 'tr'], ['span', 'div', 'td', 'tr'], ['img', 'span', 'td', 'tr']].every((chain) => navigations(h, chain) === 1),
  real,
  noCall
);
proved(
  'W2.7 a click on Open, or on anything inside it, navigates ONCE — the row does nothing',
  (h) => navigations(h, ['button', 'td', 'tr']) === 1 && navigations(h, ['i', 'span', 'button', 'td', 'tr']) === 1,
  real,
  noGuard
);
proved(
  'W2.8 a click on a link in the row is the link’s; the row does nothing',
  (h) => navigations(h, ['a', 'td', 'tr']) === 0,
  real,
  noGuard
);
proved(
  'W2.9 a drag that selected text in the row does not open it',
  (h) => navigations(h, ['span', 'td', 'tr'], 'Ana') === 0 && navigations(h, ['span', 'td', 'tr'], '') === 1,
  real,
  noSelection
);

// ---------------------------------------------------------------------------
console.log('W2 — only the Messages lists, to the path Open already uses (source text)');
const onlyMessagesLists = (map) => {
  const who = callers(map, /onRowClick=\{/);
  const list = map[LIST] || '';
  return (
    same(who, [LIST]) &&
    same(callers(map, /<ConversationsPage\b/), LISTS) &&
    list.includes('onRowClick={(row) => navigate(`${base}/${row.other_user_id}`)}') &&
    list.includes('to: `${base}/${row.other_user_id}`,')
  );
};
proved(
  'W2.10 onRowClick is passed by ConversationsPage alone (both roles’ lists), to the thread path',
  onlyMessagesLists,
  files,
  withFile('pages/teacher/StudentsPage.jsx', `${files['pages/teacher/StudentsPage.jsx'] || ''}\n// <DataTable onRowClick={() => {}} />\n`),
  withFile(LIST, files[LIST].replace('onRowClick={(row) => navigate(`${base}/${row.other_user_id}`)}', 'onRowClick={(row) => navigate(`${base}`)}'))
);
const openUnchanged = (list) =>
  /render: \(row\) => \(\n\s*<Button size="sm" onClick=\{\(\) => navigate\(`\$\{base\}\/\$\{row\.other_user_id\}`\)\}>\n\s*Open\n\s*<\/Button>\n\s*\),/.test(list);
proved(
  'W2.11 Open is exactly as it was: a button, its own navigate to the same path',
  openUnchanged,
  files[LIST],
  files[LIST].replace('<Button size="sm" onClick={() => navigate(`${base}/${row.other_user_id}`)}>', '<Button size="sm">')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
