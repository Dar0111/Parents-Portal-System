import { useState } from 'react';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import { TEXT_SIZES, readTextSize, saveTextSize } from './textSize';

// Personalization — Text size only in this dispatch (dark mode is a later
// one). Stored on this device only; see textSize.js for why and for the
// startup path that avoids a flash.
//
// §5e: no confirmation — picking the other option is the undo, and the
// effect is on screen the instant it is picked. The radio change IS the
// save; there is no Save button to leave un-pressed.

export default function PersonalizationSection() {
  const [size, setSize] = useState(readTextSize);
  const [status, setStatus] = useState(null);

  function choose(value) {
    setSize(value);
    const remembered = saveTextSize(value);
    const label = TEXT_SIZES.find((t) => t.value === value)?.label ?? value;
    setStatus(
      remembered
        ? ok(`Text size set to ${label}. Stored on this device only.`)
        : fail(
            `Text size set to ${label} for now, but this browser is not letting the site remember it — it will go back to Normal next time.`
          )
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Personalization</h2>
        <p className="mt-1 text-sm text-slate-500">
          These choices are stored on this device only. Other devices, and other people using
          this account elsewhere, are not affected.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Text size</legend>
        {TEXT_SIZES.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
              size === option.value
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="text-size"
              value={option.value}
              checked={size === option.value}
              onChange={() => choose(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">{option.label}</span>
              <span className="block text-sm text-slate-500">{option.description}</span>
            </span>
          </label>
        ))}
        <FormStatus status={status} />
      </fieldset>
    </div>
  );
}
