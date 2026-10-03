import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { cardClass } from '../components/buttonStyles';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';
import SectionHeader from '../components/SectionHeader';
import Seal from '../components/Seal';
import Text from '../components/Text';
import Icon from '../icons';
import Reveal from '../motion/Reveal';
import { useTheme } from '../theme/ThemeProvider';

// The web's About page (pre-Stage-5 #5a, §23; restyled for feat/ui-refresh,
// 2026-10-02). THE SCHOOL VALUES ARE SETTINGS, never hardcoded: the six
// `school_*` keys arrive from GET /settings signed in or GET /settings/public
// from the sign-in screen (`route.params.publicView`). The DepEd Vision,
// Mission, Core Values and Mandate are the Department's text (DO 36, s. 2013;
// RA 9155), transcribed verbatim from the web page. Phone, email and Facebook
// open through Linking.
//
// THE LAYOUT IS THE WEB'S AT PHONE WIDTH: the hero on the brand panel (the
// seal without the halo — the halo is the sign-in band's), then one small
// card per school detail, then the Department's four texts as cards in the
// order the web has them, stacked. The DepEd text is reading text: the larger
// body size and relaxed leading.
//
// PULL TO REFRESH calls the screen's one existing read — the same settings
// request, and with it the section count behind the hero's pill. A pull that
// fails with details already on screen keeps them and says so above the
// tiles.
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

// THE PILL IS `bg-surface`, NOT `bg-brand-panel-lit` (feat/ui-palette,
// 2026-10-01). brand-panel-lit is the contrast PROBE (the panel with its glow
// composited), not a paint; on a light panel it is within 1.03:1 of the
// panel, so the chip vanished. `surface` is a paint token and reads as a chip
// on the panel in both themes. Its text is `fg-secondary`, a checked pair on
// `surface` and the one the web's pill uses.
function Pill({ children }) {
  return (
    <View className="rounded-full bg-surface px-3 py-1">
      <Text className="text-xs font-semibold text-fg-secondary">{children}</Text>
    </View>
  );
}

// The icon chip every tile and card title here leads with: the tinted square
// with the accent glyph (`brand` on `brand-soft`, the active-nav pair).
function Chip({ icon }) {
  const { tokens } = useTheme();
  return (
    <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
      <Icon name={icon} size={14} color={tokens.brand} />
    </View>
  );
}

// ONE SCHOOL DETAIL, AS ITS OWN SMALL CARD.
//
// A LONG VALUE WRAPS, IT IS NEVER CUT: the Facebook page is one long URL with
// no space in it, so the text column is `min-w-0 flex-1` and the value takes
// as many lines as it needs.
//
// A LINKED DETAIL IS TAPPABLE AS A WHOLE TILE. The email, the phone and the
// Facebook page used to be one line of underlined text — a target far under
// 48dp. The tile is the same link with the same destination, now a finger's
// size, and it answers a press with Android's ripple (a prop, never a style
// function — M20). Its floor is stated in dp through a plain style object,
// like every other target here (M19). The value keeps its underline, so a
// link and a plain value differ by more than colour.
function DetailTile({ icon, label, value, href, empty = 'Not recorded' }) {
  const { tokens } = useTheme();
  const linked = Boolean(value && href);
  const shell = `${cardClass} p-4`;

  const body = (
    <View className="flex-row items-start gap-3">
      <Chip icon={icon} />
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
        {value ? (
          <Text className={`mt-0.5 text-sm ${linked ? 'text-brand underline' : 'text-fg'}`}>{value}</Text>
        ) : (
          <Text className="mt-0.5 text-sm text-fg-muted">{empty}</Text>
        )}
      </View>
    </View>
  );

  if (linked) {
    return (
      <Pressable
        onPress={() => Linking.openURL(href).catch(() => {})}
        accessibilityRole="link"
        android_ripple={{ color: tokens['edge-strong'] }}
        className={`${shell} overflow-hidden`}
        style={{ minHeight: 48 }}
      >
        {body}
      </Pressable>
    );
  }
  return <View className={shell}>{body}</View>;
}

// A card's title: the icon chip and the heading in the title face (never
// beside a weight class — both are families).
function SectionHeading({ icon, children }) {
  return (
    <View className="flex-row items-center gap-3">
      <Chip icon={icon} />
      <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-base text-fg">
        {children}
      </Text>
    </View>
  );
}

// "Back to sign in" on the signed-out frame: muted on the page colour, a
// 48dp line (a plain style object in dp — M19).
function BackToSignIn({ onPress }) {
  const { tokens } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="flex-row items-center gap-2" style={{ minHeight: 48 }}>
      <Icon name="fa-arrow-left" size={11} color={tokens['fg-muted']} />
      <Text className="text-sm font-semibold text-fg-muted">Back to sign in</Text>
    </Pressable>
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

// The screen's body. `sections` is null when the mount could not read them
// (the public view) and the pill is simply absent. `error` / `onRetry` are a
// failed re-read of the mount's own request, with details already on screen.
export function AboutBody({ settings, sections = null, error = null, onRetry = null }) {
  const name = settings?.school_name || '';
  const schoolYear = settings?.academic_year || '';
  const sectionsPill = sectionSummary(sections);
  const phoneHref = settings?.school_phone ? `tel:${settings.school_phone.replace(/[\s\-().]/g, '')}` : null;
  const facebook = settings?.facebook_page || '';
  const facebookHref = /^https?:\/\//i.test(facebook) ? facebook : null;

  return (
    <View className="gap-4">
      {/* THE HERO — the brand panel in both themes. The screen's one entrance:
          this body mounts when the first read answers and stays mounted
          through a pull, so the entrance never replays. */}
      <Reveal>
        <View className="items-center rounded-2xl border border-edge bg-brand-panel p-5">
          <Seal size={88} />
          <Text className="mt-4 text-center text-xs font-semibold uppercase tracking-widest text-brand-panel-muted">{EYEBROW}</Text>
          {name ? (
            <Text accessibilityRole="header" className="mt-2 text-center font-serif text-2xl text-brand-panel-fg">
              {name}
            </Text>
          ) : (
            <Text accessibilityRole="header" className="mt-2 text-center font-serif text-2xl text-brand-panel-muted">
              School name not recorded
            </Text>
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
      </Reveal>

      {/* SCHOOL DETAILS — one small card per detail, in one column. */}
      <View className="gap-3">
        <SectionHeader title="School details" />
        {/* Only a failed PULL reaches here — a first read that fails has no
            details to keep, and the mount shows the error alone. The API's
            own wording, with the same retry. */}
        {error ? <ErrorAlert message={error} onRetry={onRetry} /> : null}
        <DetailTile icon="fa-location-dot" label="Address" value={settings?.school_address} />
        <DetailTile icon="fa-envelope" label="Email" value={settings?.school_email} href={settings?.school_email ? `mailto:${settings.school_email}` : null} />
        <DetailTile icon="fa-phone" label="Phone" value={settings?.school_phone} href={phoneHref} />
        <DetailTile icon="fa-id-card" label="DepEd School ID" value={settings?.school_id} />
        <DetailTile icon="fa-share-nodes" label="Facebook page" value={facebook} href={facebookHref} empty="Not yet recorded" />
      </View>

      <Text className="text-sm text-fg-muted">
        The school adopts the Department of Education's Vision, Mission and Core Values — DepEd Order No. 36, s. 2013.
        The Mandate is the Department's under Republic Act 9155, as the Department publishes it.
      </Text>

      {/* Index keys, deliberately: these are static constants, and the two
          Mandate paragraphs both begin "The Department of Educat…". */}
      <View className={`${cardClass} p-5`}>
        <SectionHeading icon="fa-eye">The DepEd Vision</SectionHeading>
        {DEPED_VISION.map((paragraph, i) => (
          <Text key={i} className="mt-3 text-base leading-relaxed text-fg-body">
            {paragraph}
          </Text>
        ))}
      </View>

      <View className={`${cardClass} p-5`}>
        <SectionHeading icon="fa-bullseye">The DepEd Mission</SectionHeading>
        <Text className="mt-3 text-base leading-relaxed text-fg-body">{DEPED_MISSION_LEAD}</Text>
        <View className="mt-3 gap-2">
          {DEPED_MISSION_LINES.map(([subject, rest]) => (
            <View key={subject} className="flex-row gap-3">
              <View className="mt-2.5 h-1.5 w-1.5 rounded-full bg-brand" />
              <Text className="min-w-0 flex-1 text-base leading-relaxed text-fg-body">
                <Text className="font-semibold text-fg">{subject}</Text>
                {rest}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* CORE VALUES — four tiles, two to a row; the gloss is the design
          board's, not DepEd's, and is styled as one. */}
      <View className={`${cardClass} p-5`}>
        <SectionHeading icon="fa-heart">Our Core Values</SectionHeading>
        <View className="mt-4 flex-row flex-wrap gap-3">
          {DEPED_CORE_VALUES.map(([value, gloss]) => (
            <View key={value} className="w-[47%] items-center rounded-xl bg-surface-subtle px-3 py-4">
              <Text className="text-center text-sm font-semibold italic text-fg">{value}</Text>
              <Text className="mt-1 text-center text-xs text-fg-muted">{gloss}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className={`${cardClass} p-5`}>
        <SectionHeading icon="fa-landmark">The DepEd Mandate</SectionHeading>
        {DEPED_MANDATE.map((paragraph, i) => (
          <Text key={i} className="mt-3 text-base leading-relaxed text-fg-body">
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Retry and a pull re-run the effect below by bumping this; the effect
  // itself sets no state synchronously, only in the request's callbacks.
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
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicView, attempt]);

  // The screen's one read, asked for again — by "Try again" (in the loading
  // frame's place) and by a pull (under the pull spinner, the details kept).
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  const pullToRefresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const body =
    (loading || refreshing) && !settings ? (
      <LoadingSpinner className="py-16" label="Loading school details…" />
    ) : !settings ? (
      <ErrorAlert message={error || 'School details could not be loaded.'} onRetry={load} />
    ) : (
      <AboutBody settings={settings} sections={sections} error={error} onRetry={load} />
    );

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      contentContainerStyle={publicView ? { paddingTop: insets.top + 16 } : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      {/* Signed out there is no header and no drawer, so the way back to the
          sign-in screen is here — above the page and, once the details are
          on screen, under it too, because the page is several screens long. */}
      {publicView ? (
        <View className="items-start">
          <BackToSignIn onPress={() => navigation.goBack()} />
        </View>
      ) : null}
      {body}
      {publicView && settings ? (
        <View className="items-center">
          <BackToSignIn onPress={() => navigation.goBack()} />
        </View>
      ) : null}
    </ScrollView>
  );
}
