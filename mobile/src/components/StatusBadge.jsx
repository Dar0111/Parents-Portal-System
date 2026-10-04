import { View } from 'react-native';
import Text from './Text';

// The web's StatusBadge over the same tone map (§4, §5d): four vocabularies,
// one map, NO VERDICTS. `toneForStatus` keys on the lowercased value and the
// label is title-cased for display only; a `tone` prop overrides; unknown
// values fall back to neutral. The web's `ring-1 ring-inset` is a border here.
const TONES = {
  neutral: { box: 'bg-neutral-soft border-neutral-edge', text: 'text-neutral-fg' },
  success: { box: 'bg-success-soft border-success-edge', text: 'text-success-fg' },
  warning: { box: 'bg-warning-soft border-warning-edge', text: 'text-warning-fg' },
  danger: { box: 'bg-danger-soft border-danger-edge', text: 'text-danger-fg' },
  info: { box: 'bg-info-soft border-info-edge', text: 'text-info-fg' },
};

const STATUS_TONE = {
  active: 'success',
  pending: 'warning',
  inactive: 'neutral',
  rejected: 'danger',
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
  approved: 'success',
  declined: 'danger',
  locked: 'neutral',
  unlocked: 'info',
};

function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function toneForStatus(status) {
  if (typeof status !== 'string') return 'neutral';
  return STATUS_TONE[status.trim().toLowerCase()] || 'neutral';
}

export default function StatusBadge({ status, tone, label, className = '' }) {
  if (status === null || status === undefined || status === '') return null;
  const resolved = TONES[tone] || TONES[toneForStatus(status)];
  return (
    // A TAG, not a pill (feat/look-fixes, §27f / M23): the tag corner.
    <View className={`self-start rounded-md border px-2.5 py-0.5 ${resolved.box} ${className}`}>
      <Text className={`text-xs font-semibold ${resolved.text}`}>{label || titleCase(status)}</Text>
    </View>
  );
}
