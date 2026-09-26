import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';
import Seal from '../components/Seal';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';

// The web's About page (pre-Stage-5 #5a, §23). THE SCHOOL VALUES ARE SETTINGS,
// never hardcoded: the six `school_*` keys arrive from GET /settings signed
// in or GET /settings/public from the sign-in screen (`route.params.publicView`).
// The DepEd Vision, Mission, Core Values and Mandate are the Department's
// text (DO 36, s. 2013; RA 9155), transcribed verbatim from the web page.
// Phone, email and Facebook open through Linking.
const DEPED_VISION = [
  'We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.',
  'As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.',
];
const DEPED_MISSION_LEAD =
  'To protect and promote the right of every Filipino to quality, equitable, culture-based, and complete basic education where:';
const DEPED_MISSION_LINES = [
  ['Students', ' learn in a child-friendly, gender-sensitive, safe, and motivating environment.'],
  ['Teachers', ' facilitate learning and constantly nurture every learner.'],
  ['Administrators and staff', ', as stewards of the institution, ensure an enabling and supportive environment for effective learning to happen.'],
  ['Family, community, and other stakeholders', ' are actively engaged and share responsibility for developing life-long learners.'],
];
const DEPED_CORE_VALUES = [
  ['Maka-Diyos', 'God-loving'],
  ['Maka-tao', 'Humane'],
  ['Makakalikasan', 'Nature-caring'],
  ['Makabansa', 'Nation-loving'],
];
const DEPED_MANDATE = [
  'The Department of Education was established through the Education Decree of 1863 as the Superior Commission of Primary Instruction under a Chairman. The Education agency underwent many reorganization efforts in the 20th century in order to better define its purpose vis a vis the changing administrations and charters. The present day Department of Education was eventually mandated through Republic Act 9155, otherwise known as the Governance of Basic Education act of 2001 which establishes the mandate of this agency.',
  'The Department of Education (DepEd) formulates, implements, and coordinates policies, plans, programs and projects in the areas of formal and non-formal basic education. It supervises all elementary and secondary education institutions, including alternative learning systems, both public and private; and provides for the establishment and maintenance of a complete, adequate, and integrated system of basic education relevant to the goals of national development.',
];
const EYEBROW = 'Pateros District · Metro Manila · Est. 1961';

function Pill({ children }) {
  return (
    <View className="rounded-full bg-brand-panel-lit px-3 py-1">
      <Text className="text-xs font-medium text-brand-panel-fg">{children}</Text>
    </View>
  );
}

function DetailTile({ icon, label, value, href, empty = 'Not recorded' }) {
  const { tokens } = useTheme();
  const open = href ? () => Linking.openURL(href).catch(() => {}) : null;
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-surface-subtle">
        <Icon name={icon} size={14} color={tokens.brand} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
        {value ? (
          open ? (
            <Pressable onPress={open} accessibilityRole="link">
              <Text className="mt-0.5 text-sm text-brand underline">{value}</Text>
            </Pressable>
          ) : (
            <Text className="mt-0.5 text-sm text-fg">{value}</Text>
          )
        ) : (
          <Text className="mt-0.5 text-sm text-fg-muted">{empty}</Text>
        )}
      </View>
    </View>
  );
}

function SectionHeading({ icon, children }) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface-subtle">
        <Icon name={icon} size={13} color={tokens.brand} />
      </View>
      <Text className="text-sm font-semibold text-fg">{children}</Text>
    </View>
  );
}

function sectionSummary(sections) {
  if (!sections || sections.length === 0) return null;
  const grades = sections.map((s) => Number(s.grade_level)).filter(Number.isInteger);
  const lo = Math.min(...grades);
  const hi = Math.max(...grades);
  const range = lo === hi ? `Grade ${lo}` : `Grades ${lo}–${hi}`;
  return `${sections.length} ${sections.length === 1 ? 'section' : 'sections'} · ${range}`;
}

export function AboutBody({ settings, sections = null }) {
  const name = settings?.school_name || '';
  const schoolYear = settings?.academic_year || '';
  const sectionsPill = sectionSummary(sections);
  const phoneHref = settings?.school_phone ? `tel:${settings.school_phone.replace(/[\s\-().]/g, '')}` : null;
  const facebook = settings?.facebook_page || '';
  const facebookHref = /^https?:\/\//i.test(facebook) ? facebook : null;

  return (
    <View className="gap-5">
      <View className="items-center rounded-xl bg-brand-panel p-6">
        <Seal size={88} />
        <Text className="mt-4 text-center text-xs font-medium uppercase tracking-widest text-brand-panel-muted">{EYEBROW}</Text>
        {name ? (
          <Text className="mt-2 text-center text-2xl font-semibold text-brand-panel-fg">{name}</Text>
        ) : (
          <Text className="mt-2 text-center text-2xl font-semibold text-brand-panel-muted">School name not recorded</Text>
        )}
        <Text className="mt-2 text-center text-sm text-brand-panel-muted">
          A public elementary school of the Department of Education, Pateros, Metro Manila.
        </Text>
        <View className="mt-4 flex-row flex-wrap justify-center gap-2">
          {settings?.school_id ? <Pill>DepEd School ID {settings.school_id}</Pill> : null}
          {schoolYear ? <Pill>School Year {schoolYear}</Pill> : null}
          {sectionsPill ? <Pill>{sectionsPill}</Pill> : null}
        </View>
      </View>

      <View className="rounded-xl border border-edge bg-surface p-5">
        <Text className="text-sm font-semibold text-fg">School details</Text>
        <View className="mt-4 gap-5">
          <DetailTile icon="fa-location-dot" label="Address" value={settings?.school_address} />
          <DetailTile icon="fa-envelope" label="Email" value={settings?.school_email} href={settings?.school_email ? `mailto:${settings.school_email}` : null} />
          <DetailTile icon="fa-phone" label="Phone" value={settings?.school_phone} href={phoneHref} />
          <DetailTile icon="fa-id-card" label="DepEd School ID" value={settings?.school_id} />
          <DetailTile icon="fa-share-nodes" label="Facebook page" value={facebook} href={facebookHref} empty="Not yet recorded" />
        </View>
      </View>

      <Text className="text-sm text-fg-muted">
        The school adopts the Department of Education's Vision, Mission and Core Values — DepEd Order No. 36, s. 2013.
        The Mandate is the Department's under Republic Act 9155, as the Department publishes it.
      </Text>

      <View className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-eye">The DepEd Vision</SectionHeading>
        {DEPED_VISION.map((paragraph, i) => (
          <Text key={i} className="mt-3 text-sm leading-relaxed text-fg-body">
            {paragraph}
          </Text>
        ))}
      </View>

      <View className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-bullseye">The DepEd Mission</SectionHeading>
        <Text className="mt-3 text-sm leading-relaxed text-fg-body">{DEPED_MISSION_LEAD}</Text>
        <View className="mt-2 gap-2">
          {DEPED_MISSION_LINES.map(([subject, rest]) => (
            <View key={subject} className="flex-row gap-2">
              <View className="mt-2 h-1.5 w-1.5 rounded-full bg-brand" />
              <Text className="flex-1 text-sm leading-relaxed text-fg-body">
                <Text className="font-semibold text-fg">{subject}</Text>
                {rest}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-heart">Our Core Values</SectionHeading>
        <View className="mt-4 flex-row flex-wrap gap-3">
          {DEPED_CORE_VALUES.map(([value, gloss]) => (
            <View key={value} className="w-[47%] items-center rounded-lg bg-surface-subtle px-3 py-3">
              <Text className="text-sm font-semibold italic text-fg">{value}</Text>
              <Text className="mt-0.5 text-xs text-fg-muted">{gloss}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-landmark">The DepEd Mandate</SectionHeading>
        {DEPED_MANDATE.map((paragraph, i) => (
          <Text key={i} className="mt-3 text-sm leading-relaxed text-fg-body">
            {paragraph}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function AboutScreen({ navigation, route }) {
  const publicView = Boolean(route?.params?.publicView);
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const [settings, setSettings] = useState(null);
  const [sections, setSections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get(publicView ? '/settings/public' : '/settings', { unwrap: 'settings' })
      .then((data) => {
        if (cancelled) return null;
        setSettings(data);
        if (publicView) return null;
        const params = data?.academic_year ? { school_year: data.academic_year } : {};
        return api
          .get('/sections', { unwrap: 'sections', params })
          .then((rows) => {
            if (!cancelled) setSections(rows);
          })
          .catch(() => {
            if (!cancelled) setSections(null);
          });
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicView, attempt]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const body =
    loading && !settings ? (
      <LoadingSpinner className="py-16" label="Loading school details…" />
    ) : !settings ? (
      <ErrorAlert message={error || 'School details could not be loaded.'} onRetry={load} />
    ) : (
      <AboutBody settings={settings} sections={sections} />
    );

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="p-4 pb-10"
      contentContainerStyle={publicView ? { paddingTop: insets.top + 16 } : undefined}
    >
      {publicView ? (
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="link" className="mb-4 flex-row items-center gap-2 self-start">
          <Icon name="fa-arrow-left" size={11} color={tokens['fg-muted']} />
          <Text className="text-sm font-medium text-fg-muted">Back to sign in</Text>
        </Pressable>
      ) : null}
      {body}
    </ScrollView>
  );
}
