import { Alert, View } from 'react-native';
import { DRAFT_COPY } from '../drafts/draftCore';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import Button from './Button';
import Text from './Text';

// "DRAFT RESTORED" ON THE PHONE (feat/form-drafts, 2026-10-04; MOBILE M25) —
// the web's components/DraftNotice.jsx: where the draft is kept and until when
// (§5i), and Discard draft. DISCARD ASKS FIRST (§5e — deleting typed text has
// no undo), as a system Alert: on the phone a dialog is already the
// confirmation every irreversible action uses.
//
// `kind` is 'form' or 'message' (submit vs send); `changed` is an edit draft
// whose item was changed after the draft began. Tokens and the shared Button.
export default function DraftNotice({ kind = 'form', changed = false, onDiscard, className = '' }) {
  const { tokens } = useTheme();
  const text = changed ? DRAFT_COPY.itemChanged : kind === 'message' ? DRAFT_COPY.restoredPhoneMessage : DRAFT_COPY.restoredPhoneForm;

  function ask() {
    Alert.alert(DRAFT_COPY.discardTitle, DRAFT_COPY.discardBody, [
      { text: DRAFT_COPY.discardKeep, style: 'cancel' },
      { text: DRAFT_COPY.discardConfirm, style: 'destructive', onPress: onDiscard },
    ]);
  }

  return (
    <View accessibilityLiveRegion="polite" className={`gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 ${className}`}>
      <View className="flex-row items-start gap-3">
        <Icon name="fa-floppy-disk" size={16} color={tokens['info-strong']} style={{ marginTop: 2 }} />
        <Text className="min-w-0 flex-1 text-sm text-info-strong">{text}</Text>
      </View>
      <Button size="sm" className="self-end" onPress={ask}>
        {DRAFT_COPY.discardAction}
      </Button>
    </View>
  );
}
