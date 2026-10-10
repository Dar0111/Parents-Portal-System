import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import useTeacherTargets, { keyOf } from '../../hooks/useTeacherTargets';
import teacherAnnouncementCard from './announcements/card';

// TEACHER → ANNOUNCEMENTS — list, compose, edit, delete. THIS IS THE CLASS
// BOARD: a teacher's only legal target is an exact section, so every post
// here is already a Class Board post and no separate control exists. The
// Section filter is ONE bounded control and auto-applies (§21); New
// announcement is neutral on its own row (§21b). Edit and Delete are two
// peers on a STATIC card (`actions`, rendered because there is no
// `onSelect`), offered only to the author — the API answers 403 to anyone
// else. Delete is a HARD DELETE with no restore, so it confirms with a
// native Alert naming the post (§5e). The card is the verbatim
// `announcements/card.jsx`; the outcome of a write renders above the list
// (§7c), carried back from the compose screen as `notice`.
//
// THE SECTION HEADER (feat/ui-refresh) carries the list's title and — for a
// teacher with no class to post to — the sentence that stops the missing
// button reading as broken; nothing is said while the target list is loading.
export default function AnnouncementsScreen({ navigation, route }) {
  const { user } = useAuth();
  const { sections, loading: targetsLoading } = useTeacherTargets();
  const notice = route?.params?.notice || null;

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState('');
  const [writeStatus, setWriteStatus] = useState(null);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...listParams({ offset }) };
        if (applied) {
          const [grade, name] = applied.split('|');
          params.grade_level = grade;
          params.section = name;
        }
        const result = await api.get('/announcements', { unwrap: ['announcements', 'page'], params });
        setRows((prev) => (offset === 0 ? result.announcements : [...prev, ...result.announcements]));
        setPage(result.page);
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setRows([]);
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

  useFocusEffect(
    useCallback(() => {
      if (notice) {
        setWriteStatus(ok(notice));
        load(0);
        navigation.setParams({ notice: null });
      }
    }, [notice, load, navigation])
  );

  function confirmDelete(row) {
    setWriteStatus(null);
    Alert.alert('Delete announcement', `Delete “${row.title}”? This cannot be undone — parents who have not read it yet will never see it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/announcements/${row.id}`, { raw: true });
            await load(0);
            setWriteStatus(ok('Announcement deleted.'));
          } catch (err) {
            setWriteStatus(fail(extractError(err)));
          }
        },
      },
    ]);
  }

  const canPost = sections.length > 0;

  const empty = applied
    ? {
        icon: 'fa-filter',
        title: 'No announcements for that section',
        message: 'Try another section, or clear the filter to see everything you can read.',
        action: (
          <Button size="sm" onPress={() => setApplied('')}>
            Clear filter
          </Button>
        ),
      }
    : {
        icon: 'fa-bullhorn',
        title: 'No announcements yet',
        message: canPost ? 'School-wide posts from the admin and posts for your classes appear here.' : 'School-wide posts from the admin appear here.',
      };

  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader
        title="Posted announcements"
        description={targetsLoading || canPost ? null : 'You can post once you are assigned to a class or made a section adviser.'}
      />
      {!targetsLoading && canPost ? (
        <Button
          icon="fa-plus"
          className="self-end"
          onPress={() => {
            setWriteStatus(null);
            navigation.navigate('AnnouncementCompose');
          }}
        >
          New announcement
        </Button>
      ) : null}
      <View className={`${cardClass} p-4`}>
        <Segmented
          label="Section"
          value={applied}
          onChange={setApplied}
          options={[{ key: '', label: 'All my classes' }, ...sections.map((s) => ({ key: keyOf(s), label: `Grade ${s.grade_level} - ${s.name}` }))]}
        />
      </View>
      <FormStatus status={writeStatus} />
    </View>
  );

  return (
    <DataList
      rows={rows}
      queryKey={[applied]}
      renderCard={(row) =>
        teacherAnnouncementCard(row, {
          actions:
            row.posted_by === user?.id
              ? [
                  { label: 'Edit', onPress: () => navigation.navigate('AnnouncementCompose', { editing: row }) },
                  { label: 'Delete', tone: 'danger', onPress: () => confirmDelete(row) },
                ]
              : undefined,
        })
      }
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
