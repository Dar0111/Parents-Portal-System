import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { staffAudienceLabel } from '../../format/audience';
import { timestampDay } from '../../format/date';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { announcementFilterParams, canEditAnnouncement, deleteSentence, EMPTY_FILTER } from './posts/logic';

// ADMIN → ANNOUNCEMENTS & MEMOS — the web's admin/AnnouncementsPage.jsx. The
// web stacks two lists; the phone SWITCHES between them with two segments
// (Darryl, Q3 — a declared difference: two paged lists cannot share one
// scroll). Memos live here because they have no other home: this is the only
// place a memo can be written.
//
//   Announcements — grade / class STAGED behind Apply (§21a); a school-wide
//                   post is never in a filtered list, and the empty copy says
//                   so. EDIT ONLY YOUR OWN, DELETE ANY (an admin PUT would put
//                   new words under a teacher's name).
//   Memos         — no filter; every memo is editable and deletable here.
//
// Cards are static with Edit / Delete underneath (§5a-iii). DELETE is a hard
// delete with no restore, so it confirms with a native Alert carrying the
// web's sentence — naming the post and, for a teacher's post, that the
// teacher is not told (§5e). New announcement / New memo are neutral, on
// their own row (§21b). Each list re-reads on focus (M14) and its write
// result renders above it (§7c).
//
// THE LOOK (feat/ui-refresh, 2026-10-03) is the web's: the screen's one note
// as a note, BEFORE the switch — a reader looking for a Memos screen needs to
// be told first — then the switch, the chosen list's own SectionHeader, its
// "New …" action on its own row, and the announcement filter in its own card.
const SEGMENTS = [
  { key: 'announcements', label: 'Announcements' },
  { key: 'memos', label: 'Memos' },
];
const GRADES = [{ key: '', label: 'All grades' }, ...[1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }))];

export default function AnnouncementsScreen({ navigation, route }) {
  const { user: me } = useAuth();
  const { tokens } = useTheme();
  const notice = route?.params?.notice || null;
  const noticeKind = route?.params?.kind || null;
  const [kind, setKind] = useState('announcements');
  const [sections, setSections] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTER);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [status, setStatus] = useState({});
  const dirty = isDirty(filterDraft, filter);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        if (kind === 'announcements') {
          const result = await api.get('/announcements', { unwrap: ['announcements', 'page'], params: { ...listParams({ offset }), ...announcementFilterParams(filter) } });
          setRows((prev) => (offset === 0 ? result.announcements : [...prev, ...result.announcements]));
          setPage(result.page);
        } else {
          const result = await api.get('/memos', { unwrap: ['memos', 'page'], params: listParams({ offset }) });
          setRows((prev) => (offset === 0 ? result.memos : [...prev, ...result.memos]));
          setPage(result.page);
        }
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [kind, filter]
  );

  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (notice) {
        const key = noticeKind === 'memo' ? 'memos' : 'announcements';
        setKind(key);
        setStatus({ [key]: ok(notice) });
        navigation.setParams({ notice: null, kind: null });
      }
    }, [notice, noticeKind, navigation])
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setSections(all);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filterSections = useMemo(
    () => (filterDraft.grade ? sections.filter((s) => Number(s.grade_level) === Number(filterDraft.grade)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [sections, filterDraft.grade]
  );

  function confirmDelete(row) {
    const one = kind === 'memos' ? 'memo' : 'announcement';
    setStatus({});
    Alert.alert(one === 'memo' ? 'Delete memo' : 'Delete announcement', deleteSentence(one, row, me?.id), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/${kind}/${row.id}`, { unwrap: 'message' });
            await load(0);
            setStatus({ [kind]: ok(one === 'memo' ? 'Memo deleted.' : 'Announcement deleted.') });
          } catch (err) {
            setStatus({ [kind]: fail(extractError(err)) });
          }
        },
      },
    ]);
  }

  function applyFilter() {
    setFilter(filterDraft);
  }

  function resetFilter() {
    setFilterDraft(EMPTY_FILTER);
    setFilter(EMPTY_FILTER);
  }

  const canReset = Boolean(filter.grade || filter.section);
  const filterLabel = filter.section ? `Grade ${filter.grade} - ${filter.section}` : `Grade ${filter.grade}`;
  const isAnn = kind === 'announcements';

  const empty = isAnn
    ? canReset
      ? {
          icon: 'fa-filter',
          title: `No announcements addressed to ${filterLabel}`,
          message: 'School-wide posts are not included in this filter.',
          action: (
            <Button size="sm" onPress={resetFilter}>
              Clear filter
            </Button>
          ),
        }
      : { icon: 'fa-bullhorn', title: 'No announcements yet', message: 'Posts you make here and posts teachers make for their classes appear here.' }
    : { icon: 'fa-file-lines', title: 'No memos yet', message: 'A memo posted here reaches every teacher and parent.' };

  const header = (
    <View className="mb-4 gap-4">
      <View className="flex-row items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3">
        <Icon name="fa-circle-info" size={16} color={tokens['info-strong']} style={{ marginTop: 2 }} />
        <Text className="min-w-0 flex-1 text-sm text-info-strong">Memos have no page of their own — they are posted here and go to everyone.</Text>
      </View>
      <Segmented label="Show" value={kind} onChange={setKind} options={SEGMENTS} />
      <SectionHeader title={isAnn ? 'Announcements' : 'Memos'} />
      {/* Neutral, on its own row (§21b): Apply's fill is the "changes not
          applied" signal, so the page action is never a second filled button
          beside it — and the two "New …" actions match. */}
      <Button
        icon="fa-plus"
        className="self-end"
        onPress={() => {
          setStatus({});
          navigation.navigate('PostCompose', { kind: isAnn ? 'announcement' : 'memo' });
        }}
      >
        {isAnn ? 'New announcement' : 'New memo'}
      </Button>
      {isAnn ? (
        <View className={`${cardClass} gap-4 p-4`}>
          <Segmented label="Grade" value={filterDraft.grade} onChange={(g) => setFilterDraft({ grade: g, section: '' })} options={GRADES} />
          {filterDraft.grade ? (
            <Segmented
              label="Class"
              value={filterDraft.section}
              onChange={(s) => setFilterDraft((p) => ({ ...p, section: s }))}
              options={[{ key: '', label: 'All classes' }, ...filterSections.map((s) => ({ key: s.name, label: s.name }))]}
            />
          ) : null}
          <FilterActions dirty={dirty} canReset={canReset} onApply={applyFilter} onReset={resetFilter} />
        </View>
      ) : null}
      <FormStatus status={status[kind]} />
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => {
        const actions = [];
        if (!isAnn || canEditAnnouncement(row, me?.id)) actions.push({ label: 'Edit', onPress: () => navigation.navigate('PostCompose', { kind: isAnn ? 'announcement' : 'memo', editing: row }) });
        actions.push({ label: 'Delete', tone: 'danger', onPress: () => confirmDelete(row) });
        return {
          title: row.title,
          subtitle: row.content,
          meta: isAnn ? `${staffAudienceLabel(row)} · ${row.posted_by_name} · ${timestampDay(row.created_at)}` : `${row.posted_by_name} · ${timestampDay(row.created_at)}`,
          actions,
        };
      }}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true })}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(rows.length || PAGE_SIZE)}
      header={header}
      empty={empty}
    />
  );
}
