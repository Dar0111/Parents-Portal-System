import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import { longDate, todayLocalDateString } from '../../format/date';
import { currentTerm, termDates } from '../../format/schoolCalendar';
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
export default function SchoolSettingsScreen() {
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
        <Text className="text-sm text-fg-muted">These settings belong to the school, not to your account. Your own account is under Account information.</Text>
        {error ? <ErrorAlert message={error} onRetry={load} /> : null}

        <View className="gap-3">
          <Text className="text-sm font-semibold text-fg">School year and term</Text>
          <View className="gap-3 rounded-lg border border-edge bg-surface-subtle px-4 py-3">
            <View>
              <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">School year</Text>
              <Text className="mt-1 text-sm text-fg">{stored.academic_year || 'Not recorded'}</Text>
            </View>
            <View>
              <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">Current term</Text>
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

        <View className="gap-3">
          <Text className="text-sm font-semibold text-fg">School details</Text>
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
          <Pressable
            onPress={save}
            disabled={saving || !dirty}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !dirty, busy: saving }}
            className={`items-center rounded-lg bg-primary px-4 py-2.5 ${saving || !dirty ? 'opacity-50' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : 'Save school details'}</Text>
          </Pressable>
          <FormStatus status={status} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
