// THE HEADER OF ONE SECTION OF A PAGE (feat/ui-refresh, 2026-10-02): its
// title in the title face, an optional sentence under it, and on the right
// the section's own actions.
//
// AN `<h2>` BY DEFAULT, NEVER AN `<h1>`. The page's one `<h1>` is the title
// in the top bar (layout/Header.jsx) and the smoke run fails a page that has
// two. Pass `as="h3"` for a section inside a section.
//
// NO RELOAD CONTROL (owner, 2026-10-04): the browser's own reload is the
// reload on the web, so a section header carries only the section's own
// actions.
//
// THE PAGE'S PRIMARY ACTION GOES IN `actions` — and an empty state below
// never repeats it (§5f).
export default function SectionHeader({
  title,
  description = null,
  as: Heading = 'h2',
  actions = null,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${className}`}>
      {/* A 12rem BASIS, NOT ZERO. With `flex-1` (basis 0) the title column
          could be squeezed to a few words wide and the actions would never
          wrap; with a real basis the actions drop to their own row as soon
          as the title cannot keep 12rem beside them — a 390px phone with a
          primary action — and the title keeps the full width. */}
      <div className="min-w-0 flex-[1_1_12rem]">
        <Heading className="font-serif text-lg font-bold text-fg">{title}</Heading>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
