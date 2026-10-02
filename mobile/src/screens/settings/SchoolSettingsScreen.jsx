import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import Text from '../../components/Text';
import { longDate, todayLocalDateString } from '../../format/date';
import { currentTerm, termDates } from '../../format/schoolCalendar';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { changedDetails, detailsFrom, detailsProblem } from './schoolSettings';

// SETTINGS → SCHOOL SETTINGS (admin only) — the web's SchoolSettingsSection:
// the settings that belong to the SCHOOL, not to the admin's account. It is
// the first row of the one Settings list the verbatim `tabs.js` gives the
// admin; there is no second "Settings" (the naming answer, M16).
//
// TWO SECTIONS, ONE SAVE. The school year and the term are READ-ONLY: the
// year is locked on this page by decision, and the term is not a setting —
// it follows today's date on the school calendar. The details form sends
// ONLY CHANGED KEYS (`schoolSettings.js`); no confirmation (§5e — every value
// is on screen and reversible by saving again). `stored` is written only by
// load() (§5b); the draft is separate, null until the admin types.
//
// THE LOOK (feat/ui-refresh, 2026-10-02): each section is a card under its
// own heading; Save is the screen's one primary button, with FormStatus
// directly under it (§7c).

// A sub-section's title: the icon chip and the title face — the same block
// Account information's sub-sections use, so the two screens read alike. The
// chip is decoration; the heading is the name.
function SubHeading({ icon, children }) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
        <Icon name={icon} size={15} color={tokens.brand} />
      </View>
      <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-base text-fg">
        {children}
      </Text>
    </View>
  );
}

export default function SchoolSettingsScreen() {
  const { tokens } = useTheme();
  const [stored, setStored] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [term] = useState(() => currentTerm(todayLocalDateString()));
  const { start: termStart, end: termEnd } = termDates(term);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStored(await api.get('/settings', { unwrap: 'settings' }));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const details = draft === null ? detailsFrom(stored) : draft;
  const changed = changedDetails(stored, details);
  const dirty = Object.keys(changed).length > 0;
  const edit = (key) => (value) => setDraft((prev) => ({ ...(prev ?? detailsFrom(stored)), [key]: value }));

  // RELOAD (feat/ui-refresh) — the header's button. load() is the same
  // GET /settings the focus effect, Try again and a successful save call.
  //
  // IT DROPS THE DRAFT FIRST, as on the web, and that loses nothing: the
  // button is disabled while the form is dirty, so the only draft it can meet
  // is one that already equals the stored values — a field typed in and put
  // back. Left in place, that draft would keep the form following ITSELF
  // instead of the fresh read, and any field somebody else had changed
  // meanwhile would count as an edit back to its old value, which the next
  // save would write. Called from the press, never from an effect.
  function reload() {
    setDraft(null);
    load();
  }

  async function save() {
    if (saving) return;
    setStatus(null);
    const problem = detailsProblem(details);
    if (problem) {
      setStatus(fail(problem));
      return;
    }
    setSaving(true);
    try {
      await api.patch('/settings', { settings: changed }, { unwrap: 'message' });
      setDraft(null);
      await load();
      setStatus(ok('School details updated.'));
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !stored) return <LoadingSpinner className="py-16" label="Loading school settings…" />;
  if (!stored) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={error || 'School settings could not be loaded.'} onRetry={load} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {/* With the form on screen a reload shows no spinner in the page: the
            button's own spinner turns while `loading` is true, and a failure
            lands in the ErrorAlert below, as a failed re-read after a save
            always has.

            DISABLED WHILE THE FORM HAS UNSAVED EDITS, and while a save is in
            flight: the draft is a copy of ALL seven fields taken at the first
            keystroke, so against a newer `stored` every field somebody else
            changed meanwhile would read as "changed" back to its old value
            and the next save would undo their edit. A phone has no hover for
            the web's hint, so the reason is a caption under the header for as
            long as it applies. */}
        <View className="gap-2">
          <SectionHeader
            title="School settings"
            description="These settings belong to the school, not to your account. Your own account is under Account information."
            onReload={reload}
            reloading={loading}
            reloadDisabled={dirty || saving}
            reloadLabel="Reload school settings"
          />
          {dirty ? (
            <Text className="text-xs text-fg-muted">Save or discard your changes before reloading.</Text>
          ) : null}
        </View>
        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        <View className={`${cardClass} gap-3 p-4`}>
          <SubHeading icon="fa-calendar-days">School year and term</SubHeading>
          <View className="gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">School year</Text>
              {/* The lock is decoration: the sentence under the band is what
                  says the value cannot be changed here. */}
              <View className="mt-1 flex-row items-center gap-2">
                {stored.academic_year ? (
                  <Text className="text-xl font-bold text-fg">{stored.academic_year}</Text>
                ) : (
                  <Text className="text-sm text-fg-muted">Not recorded</Text>
                )}
                <Icon name="fa-lock" size={12} color={tokens['fg-faint']} />
              </View>
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Current term</Text>
              <Text className="mt-1 text-sm text-fg">
                Term {term} — from the school calendar, {longDate(termStart)} – {longDate(termEnd)}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-fg-muted">
            The school year cannot be changed here. Sections, grading setup and existing grades are all tied to the school year, and changing this value would not
            move any of them. The current term is not a setting either: it follows today’s date on the school calendar. The dashboards, Grades and the class
            summary open on it; on a phone, a report card opens on the latest term that has a grade in it.
          </Text>
        </View>

        <View className={`${cardClass} gap-4 p-4`}>
          <SubHeading icon="fa-school">School details</SubHeading>
          <FormField label="School name" required value={details.school_name} onChangeText={edit('school_name')} />
          <FormField label="School address" required value={details.school_address} onChangeText={edit('school_address')} multiline numberOfLines={2} textAlignVertical="top" className="min-h-20" />
          <FormField label="DepEd School ID" value={details.school_id} onChangeText={edit('school_id')} keyboardType="number-pad" maxLength={6} hint="Six digits. Shown on the About page." />
          <FormField label="School phone" value={details.school_phone} onChangeText={edit('school_phone')} keyboardType="phone-pad" hint="A landline or a mobile number, 7 to 15 digits. Shown on the About page." />
          <FormField
            label="School email"
            value={details.school_email}
            onChangeText={edit('school_email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Shown on the About page. This is the school's address, not yours."
          />
          <FormField
            label="Facebook page"
            value={details.facebook_page}
            onChangeText={edit('facebook_page')}
            autoCapitalize="none"
            autoCorrect={false}
            hint="The page's name or address. Leave blank until the school gives one — the About page then says so."
          />
          <FormField
            label="Logo URL"
            value={details.logo_url}
            onChangeText={edit('logo_url')}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            hint="A web address to an image. Leave blank for no logo. This page does not upload files."
          />
          {/* The label still changes while the save is in flight; `loading`
              adds the spinner and the busy state. */}
          <Button variant="primary" full onPress={save} disabled={saving || !dirty} loading={saving}>
            {saving ? 'Saving…' : 'Save school details'}
          </Button>
          <FormStatus status={status} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
