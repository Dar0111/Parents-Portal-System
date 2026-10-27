import { useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import SectionHeader from '../../components/SectionHeader';
import Skeleton, { SkeletonBar } from '../../components/Skeleton';
import useSkeleton from '../../hooks/useSkeleton';
import { timestampDay } from '../../format/date';

// SETTINGS → SECURITY & POLICY (feat/privacy, 2026-10-10; FRONTEND §29) —
// every role. The current Data Privacy Notice and Terms of Use, and the date
// THIS user accepted each. Every role accepts since feat/staff-acceptance
// (2026-10-11), so the server's `required` is true for staff too and they see
// their own dates; the `required: false` branch (the documents, and that
// parents accept them — never a "Not accepted" that reads as something owed)
// stays for a role that ever accepts nothing.
//
// The dates are the server's (`GET /api/policy/status`), shown as the Manila
// calendar day (format/date.js) — never computed here.
//
// One read of two endpoints, in one region with one loading and one error:
// the two answers make one picture, so `Promise.all` is right here (§12's rule
// is about independent dashboard cards).

function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export default function SecurityPolicySection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.get('/policy', { unwrap: 'documents' }),
      api.get('/policy/status', { unwrap: ['required', 'acceptances'] }),
    ])
      .then(([documents, status]) => {
        if (live) setData({ documents, status });
      })
      .catch((err) => {
        if (live) setError(extractError(err));
      });
    return () => {
      live = false;
    };
  }, [reloads]);

  const loading = !data && !error;
  const phase = useSkeleton(loading);

  function retry() {
    setError(null);
    setData(null);
    setReloads((n) => n + 1);
  }

  return <PolicyDocumentsView data={data} error={error} phase={phase} onRetry={retry} />;
}

// What the section shows, with no data loading — exported so
// scripts/ssr-privacy.jsx can render every state of it. `data` is
// { documents, status } once both reads answer.
export function PolicyDocumentsView({ data, error, phase, onRetry }) {
  const loading = !data && !error;
  const required = Boolean(data?.status?.required);
  const acceptedAt = (document) => data?.status?.acceptances?.find((a) => a.document === document)?.accepted_at || null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Security & policy"
        description={
          required
            ? "The school's Data Privacy Notice and Terms of Use, and when you accepted each."
            : "The school's Data Privacy Notice and Terms of Use. Parents accept them before using the portal."
        }
      />

      {error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : loading ? (
        <Skeleton phase={phase} label="Loading the documents…">
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar className="h-5 w-48" />
                <SkeletonBar className="h-4 w-40" />
                <SkeletonBar className="h-24 w-full" round="rounded-lg" />
              </div>
            ))}
          </div>
        </Skeleton>
      ) : (
        data.documents.map((doc) => {
          const at = acceptedAt(doc.document);
          return (
            <section key={doc.document} aria-labelledby={`security-${doc.document}`}>
              <h3 id={`security-${doc.document}`} className="font-serif text-base font-bold text-fg">
                {doc.title}
              </h3>
              {required ? (
                <p className="mt-0.5 text-sm text-fg-muted">
                  {at ? `Accepted on ${timestampDay(at, { style: 'long' })}` : 'Not accepted yet'}
                </p>
              ) : null}
              <div
                role="region"
                aria-label={`${doc.title} text`}
                tabIndex={0}
                className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-edge bg-surface-subtle p-4 text-sm text-fg-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
              >
                {paragraphs(doc.text).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
