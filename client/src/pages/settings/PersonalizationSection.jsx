import { useState } from 'react';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import { TEXT_SIZES, readTextSize, saveTextSize } from './textSize';
import { THEME_OPTIONS, readTheme, saveTheme } from './theme';

// Personalization — Text size and Theme. Both stored on this device only; see
// textSize.js and theme.js for why and for the startup path that avoids a
// flash.
//
// §5e: no confirmation — picking the other option is the undo, and the
// effect is on screen the instant it is picked. The radio change IS the
// save; there is no Save button to leave un-pressed.
//
// §7c: one status object keyed by form, so a text-size message and a theme
// message can never both be on screen — the latest pick replaces the other.

// The glyph beside each option, keyed by the option's stored value. Decoration
// only (aria-hidden): the label and the description say what the option is.
// The options themselves — values, labels, descriptions — stay in textSize.js
// and theme.js; a value with no entry here simply renders without a glyph.
//
// A Map OF PAIRS, NOT AN OBJECT LITERAL: `lint:tokens` reads the Dark
// option's value followed by a colon — which is how an object key is spelled
// — as Tailwind's theme variant, and fails the run.
const OPTION_ICONS = new Map([
  ['normal', 'fa-font'],
  ['large', 'fa-text-height'],
  ['light', 'fa-sun'],
  ['dark', 'fa-moon'],
  ['system', 'fa-circle-half-stroke'],
]);

// One option, as a card that is ONE <label> around a NATIVE radio — so the
// whole card is the click target, and arrow keys, Tab and Space work exactly
// as a radio group's do with nothing re-implemented.
//
// THE SELECTED CARD IS NOT TOLD APART BY COLOUR ALONE: the radio's own dot, a
// check mark at the right, a doubled edge (the border plus a ring of the same
// colour — a ring, so the card does not change size when it is picked) and a
// heavier label. Keyboard focus is the radio's own ring plus an outline on the
// card (`has-[input:focus-visible]`).
function OptionCard({ name, option, checked, onChange }) {
  const icon = OPTION_ICONS.get(option.value);
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus-accent ${
        checked
          ? 'border-primary bg-surface-subtle ring-1 ring-primary'
          : 'border-edge hover:border-edge-strong hover:bg-surface-subtle'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 accent-primary"
      />
      {/* The flex is on the span, never on the `fa-solid` element. */}
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
        >
          <i className={`fa-solid ${icon}`} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block text-sm text-fg ${checked ? 'font-bold' : 'font-semibold'}`}>{option.label}</span>
        <span className="block text-sm text-fg-muted">{option.description}</span>
      </span>
      {checked ? (
        <span aria-hidden="true" className="flex shrink-0 items-center justify-center text-brand">
          <i className="fa-solid fa-circle-check" />
        </span>
      ) : null}
    </label>
  );
}

export default function PersonalizationSection() {
  const [size, setSize] = useState(readTextSize);
  const [theme, setTheme] = useState(readTheme);
  const [status, setStatus] = useState({});

  function chooseSize(value) {
    setSize(value);
    const remembered = saveTextSize(value);
    const label = TEXT_SIZES.find((t) => t.value === value)?.label ?? value;
    setStatus({
      size: remembered
        ? ok(`Text size set to ${label}. Stored on this device only.`)
        : fail(
            `Text size set to ${label} for now, but this browser is not letting the site remember it — it will go back to Normal next time.`
          ),
    });
  }

  function chooseTheme(value) {
    setTheme(value);
    const remembered = saveTheme(value);
    const label = THEME_OPTIONS.find((t) => t.value === value)?.label ?? value;
    setStatus({
      theme: remembered
        ? ok(`Theme set to ${label}. Stored on this device only.`)
        : fail(
            `Theme set to ${label} for now, but this browser is not letting the site remember it — it will go back to Light next time.`
          ),
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Personalization"
        description="These choices are stored on this device only. Other devices, and other people using this account elsewhere, are not affected."
      />

      {/* The divider is on a wrapper, not on the <fieldset>: a fieldset's own
          top border is drawn THROUGH its legend. `min-w-0` because a fieldset
          is min-content wide by default and would not shrink with the panel.
          The legend's gap is padding — a legend's bottom margin is not
          reliable across browsers. */}
      <div className="border-t border-edge-soft pt-6">
        <fieldset className="min-w-0">
          <legend className="pb-3 font-serif text-base font-bold text-fg">Text size</legend>
          <div className="grid gap-3">
            {TEXT_SIZES.map((option) => (
              <OptionCard
                key={option.value}
                name="text-size"
                option={option}
                checked={size === option.value}
                onChange={() => chooseSize(option.value)}
              />
            ))}
          </div>
          <FormStatus status={status.size} className="mt-3" />
        </fieldset>
      </div>

      <div className="border-t border-edge-soft pt-6">
        <fieldset className="min-w-0">
          <legend className="pb-3 font-serif text-base font-bold text-fg">Theme</legend>
          <div className="grid gap-3">
            {THEME_OPTIONS.map((option) => (
              <OptionCard
                key={option.value}
                name="theme"
                option={option}
                checked={theme === option.value}
                onChange={() => chooseTheme(option.value)}
              />
            ))}
          </div>
          <FormStatus status={status.theme} className="mt-3" />
        </fieldset>
      </div>
    </div>
  );
}
