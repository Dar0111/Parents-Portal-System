// THE PAGE loop-messages-thread.mjs RENDERS (feat/shared-messages, commit 1).
//
// The REAL thread page each role's route renders — App.jsx sends
// /admin/messages/:userId and /parent/messages/:userId to
// pages/parent/MessageThreadPage.jsx and /teacher/messages/:userId to
// pages/teacher/MessageThreadPage.jsx, each a wrapper around
// pages/messages/MessageThread.jsx since commit 2 — inside a MemoryRouter and a stand-in
// for Shell's frame: the 16rem sidebar, the 64px sticky header and <main>'s
// padding, their class lists copied from Shell.jsx and Header.jsx (the runner
// checks they are still there). The fonts and the stylesheet are main.jsx's,
// so text wraps and measures as it does in the app. The api, auth, socket and
// unread modules are the stand-ins in mocks.jsx; the runner's plugin swaps them.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-400-italic.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-700.css';
import '@fontsource/merriweather/latin-700.css';
import '../../../src/index.css';
import ParentMessageThreadPage from '../../../src/pages/parent/MessageThreadPage.jsx';
import TeacherMessageThreadPage from '../../../src/pages/teacher/MessageThreadPage.jsx';
import { scenario } from './mocks.jsx';

const start = `/${scenario.role}/messages/${scenario.other}`;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter initialEntries={[start]}>
      <div data-app-shell="" className="flex min-h-screen bg-page">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-edge bg-surface md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-edge bg-surface px-4 sm:px-6 lg:px-8" />
          <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
            <Routes>
              <Route path="/admin/messages/:userId" element={<ParentMessageThreadPage />} />
              <Route path="/parent/messages/:userId" element={<ParentMessageThreadPage />} />
              <Route path="/teacher/messages/:userId" element={<TeacherMessageThreadPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </MemoryRouter>
  </StrictMode>
);
