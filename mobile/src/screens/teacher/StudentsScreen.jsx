import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import { sectionOptions, showSectionFilter } from './students/sectionOptions';

// TEACHER → STUDENTS — the web's StudentsPage.jsx as a card list. Search and
// Section are STAGED behind Apply with the "Changes not applied" cue (§21a:
// a free-text search is never applied per keystroke); "Clear" is this page's
// word for Reset. The Section chips appear only with something to choose
// between (`showSectionFilter`), so on the seeded data they are invisible.
//
// WHO ENROLS — THE ADVISER. The Enroll picker is the sections this teacher
// ADVISES (GET /sections filtered on adviser_id), NOT GET /assignments; the
// Section FILTER's union in `students/sectionOptions.js` (a verbatim copy)
// takes the assignments plus the loaded rows, because a filter narrows what
// is visible and is not a write scope. Enroll student is NEUTRAL and on its
// own row (§21b) — beside a filled Apply two primaries would compete. A
// teacher who advises nothing reads why there is no button, under the
// section's title, in place of the button.
//
// A card is one <Pressable> into the detail screen, and the LRN does not come
// along (§5c): the name plus the class identifies the learner on a phone.
export default function StudentsScreen({ navigation, route }) {
  const { user } = useAuth();
  const notice = route?.params?.notice || null;

  const [students, setStudents] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [advised, setAdvised] = useState([]);

  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [applied, setApplied] = useState({ search: '', section: '' });
  const draftFilters = { search: search.trim(), section: section.trim() };
  const dirty = isDirty(draftFilters, applied);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        // ?status is deliberately NOT sent (the web's note): the active-only
        // default is the one verified branch.
        const params = { ...listParams({ offset }) };
        if (applied.search) params.search = applied.search;
        if (applied.section) params.section = applied.section;
        const result = await api.get('/students', { unwrap: ['students', 'page'], params });
        setStudents((prev) => (offset === 0 ? result.students : [...prev, ...result.students]));
        setPage(result.page);
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setStudents([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [applied]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // Reload when a write brought us back (enrol, create parent), not on every focus.
  useFocusEffect(
    useCallback(() => {
      if (notice) load(0);
    }, [notice, load])
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get('/assignments', { unwrap: 'assignments' })
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setAdvised(rows.filter((sec) => Number(sec.adviser_id) === Number(user.id)));
      })
      .catch(() => {
        if (!cancelled) setAdvised([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const assignedClasses = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of assignments) {
      const key = `${row.grade_level}|${row.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, grade_level: row.grade_level, section: row.section, label: `Grade ${row.grade_level} - ${row.section}` });
    }
    return out;
  }, [assignments]);

  const classOptions = useMemo(
    () => advised.map((sec) => ({ key: `${sec.grade_level}|${sec.name}`, grade_level: sec.grade_level, section: sec.name, label: `Grade ${sec.grade_level} - ${sec.name}` })),
    [advised]
  );
  const canEnroll = classOptions.length > 0;
  const filterSections = useMemo(() => sectionOptions(assignedClasses, students), [assignedClasses, students]);

  function applyFilters() {
    setApplied(draftFilters);
  }

  function clearFilters() {
    setSearch('');
    setSection('');
    setApplied({ search: '', section: '' });
  }

  const filtered = Boolean(applied.search || applied.section);

  const empty = filtered
    ? {
        icon: 'fa-magnifying-glass',
        title: 'No students match that search',
        message: 'Try a different name, LRN, or section.',
        action: (
          <Button size="sm" onPress={clearFilters}>
            Clear filters
          </Button>
        ),
      }
    : {
        icon: 'fa-user-graduate',
        title: 'No students assigned to you yet',
        message: 'You see students in the sections you teach or advise. An admin can assign you to a section.',
      };

  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader
        title="Students in my sections"
        description={canEnroll ? null : 'Enrolling a learner is limited to the section you advise. Teaching a subject in a class is not enough.'}
      />
      {canEnroll ? (
        <Button icon="fa-user-plus" className="self-end" onPress={() => navigation.navigate('Enroll', { classOptions })}>
          Enroll student
        </Button>
      ) : null}
      {/* The filter is its own card, and only the filters live in it. */}
      <View className={`${cardClass} gap-3 p-4`}>
        <FormField label="Search" placeholder="Name or LRN" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" onSubmitEditing={applyFilters} />
        {showSectionFilter(filterSections) ? (
          <Segmented
            label="Section"
            value={section}
            onChange={setSection}
            options={[{ key: '', label: 'All my sections' }, ...filterSections.map((s) => ({ key: s.value, label: s.label }))]}
          />
        ) : null}
        <FilterActions dirty={dirty} canReset={filtered} onApply={applyFilters} onReset={clearFilters} resetLabel="Clear" />
      </View>
      {notice ? (
        <View className="gap-1">
          <FormStatus status={ok(notice)} />
          <Button variant="ghost" size="sm" className="self-end" onPress={() => navigation.setParams({ notice: null })}>
            Dismiss
          </Button>
        </View>
      ) : null}
    </View>
  );

  return (
    <DataList
      rows={students}
      renderCard={(row) => ({
        onSelect: () => navigation.navigate('StudentDetail', { id: row.id }),
        avatar: `${row.first_name} ${row.last_name}`,
        title: `${row.last_name}, ${row.first_name}`,
        subtitle: `Grade ${row.grade_level} - ${row.section}`,
        status: row.status,
      })}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true })}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(students.length || PAGE_SIZE)}
      header={header}
      empty={empty}
    />
  );
}
