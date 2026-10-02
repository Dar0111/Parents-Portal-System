import ReloadButton from './ReloadButton';

// THE HEADER OF ONE SECTION OF A PAGE (feat/ui-refresh, 2026-10-02): its
// title in the title face, an optional sentence under it, and on the right
// its controls — Reload first, then the section's own actions.
//
// AN `<h2>` BY DEFAULT, NEVER AN `<h1>`. The page's one `<h1>` is the title
// in the top bar (layout/Header.jsx) and the smoke run fails a page that has
// two. Pass `as="h3"` for a section inside a section.
//
// RELOAD BELONGS TO THE SECTION. Every section that shows server data passes
// `onReload` (its existing fetch) and `reloading` (its loading flag); the
// section's own frame — DataTable, a card — shows the loading and error
// states, exactly as it does on the first load. See ReloadButton for
// `reloadDisabled` / `reloadHint` on the screens with unsaved work.
//
// THE PAGE'S PRIMARY ACTION GOES IN `actions`, to the right of Reload — and
// an empty state below never repeats it (§5f).
export default function SectionHeader({
  title,
  description = null,
  as: Heading = 'h2',
  onReload = null,
  reloading = false,
  reloadDisabled = false,
  reloadHint = '',
  reloadLabel = 'Reload',
  actions = null,
  className = '',
}) {
  const hasControls = Boolean(onReload) || Boolean(actions);

  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${className}`}>
      {/* A 12rem BASIS, NOT ZERO. With `flex-1` (basis 0) the title column
          could be squeezed to a few words wide and the controls would never
          wrap; with a real basis the controls drop to their own row as soon
          as the title cannot keep 12rem beside them — a 390px phone with
          Reload and a primary action — and the title keeps the full width. */}
      <div className="min-w-0 flex-[1_1_12rem]">
        <Heading className="font-serif text-lg font-bold text-fg">{title}</Heading>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {hasControls ? (
        <div className="flex flex-wrap items-center gap-2">
          {onReload ? (
            <ReloadButton
              onReload={onReload}
              loading={reloading}
              disabled={reloadDisabled}
              hint={reloadHint}
              label={reloadLabel}
            />
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
