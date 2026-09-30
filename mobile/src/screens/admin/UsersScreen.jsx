import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, Text, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DataList from '../../components/DataList';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import RecordCard from '../../components/RecordCard';
import Segmented from '../../components/Segmented';
import { useNotifications } from '../../realtime/NotificationProvider';
import { canResetUsers, directoryEmpty, displayRole, EMPTY_FILTERS, maskLoginId, ROLE_FILTERS, rowActions, STATUS_FILTERS, statusMessage, userListParams } from './users/logic';
import TempPasswordModal from './users/TempPasswordModal';

// ADMIN → USERS — the web's UsersPage.jsx as one scrolling list with two
// sections: the PENDING QUEUE (GET /users/parents/pending, its own page and
// "Show more") and the DIRECTORY (GET /users, role / status / search STAGED
// behind Apply, §21a). Each section's write result renders above it (§7c).
// Admin never creates a parent (POST /users/parents is teacher-only), and
// there is no user :id route — login_id is a credential (§5c).
//
// WRITES, and how each confirms (§5e, MOBILE_CONVENTIONS M17):
//   Create teacher  — a modal screen, no confirm (the undo is deactivate).
//   Edit            — a modal screen, no confirm (repeatable).
//   Deactivate / Activate — a card action, no confirm (reversible); your own
//                     active account shows a note instead; the
//                     last-active-admin refusal is the server's 400, shown.
//   Reset password  — the two-phase popup (TempPasswordModal).
//   Review parent   — a modal screen: decide, confirm naming the decision.
//   Remove photo    — a card action on a row WITH a photo; a native Alert
//                     names the person (the file is gone, no undo).
//
// RE-READS ON FOCUS (Darryl's A4, M14): a drawer screen is never unmounted,
// so returning from a review or a create re-fetches both lists, and asks the
// bell's provider to refetch — the Users badge is the server's count (§10),
// never decremented here.
export default function UsersScreen({ navigation, route }) {
  const { user: me, refresh: refreshMe } = useAuth();
  const { refresh: refreshCounts } = useNotifications();
  const notice = route?.params?.notice || null;
  const noticeKey = route?.params?.noticeKey || 'directory';

  const [pending, setPending] = useState([]);
  const [pendingPage, setPendingPage] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const draftFilters = { role, status, search: search.trim() };
  const dirty = isDirty(draftFilters, applied);

  // Keyed status, two keys, one object (§7c): writing a key clears the other.
  const [formStatus, setFormStatus] = useState({});
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [resetting, setResetting] = useState(null);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [pendingResult, userResult] = await Promise.all([
          api.get('/users/parents/pending', { unwrap: ['parents', 'page'], params: listParams({ offset: 0 }) }),
          api.get('/users', { unwrap: ['users', 'page'], params: { ...listParams({ offset: 0 }), ...userListParams(applied) } }),
        ]);
        setPending(pendingResult.parents);
        setPendingPage(pendingResult.page);
        setUsers(userResult.users);
        setPage(userResult.page);
      } catch (err) {
        setError(extractError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applied]
  );

  async function loadMoreUsers() {
    setLoadingMore(true);
    try {
      const result = await api.get('/users', { unwrap: ['users', 'page'], params: { ...listParams({ offset: users.length || PAGE_SIZE }), ...userListParams(applied) } });
      setUsers((prev) => [...prev, ...result.users]);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMorePending() {
    try {
      const result = await api.get('/users/parents/pending', { unwrap: ['parents', 'page'], params: listParams({ offset: pending.length }) });
      setPending((prev) => [...prev, ...result.parents]);
      setPendingPage(result.page);
    } catch (err) {
      setFormStatus({ pending: fail(extractError(err)) });
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
      refreshCounts();
    }, [load, refreshCounts])
  );

  // A write on a modal screen came back with its message.
  useFocusEffect(
    useCallback(() => {
      if (notice) {
        setFormStatus({ [noticeKey]: ok(notice) });
        navigation.setParams({ notice: null, noticeKey: null });
      }
    }, [notice, noticeKey, navigation])
  );

  async function setUserStatus(row, nextStatus) {
    setFormStatus({});
    setStatusSavingId(row.id);
    try {
      await api.patch(`/users/${row.id}/status`, { status: nextStatus }, { unwrap: 'user' });
      setFormStatus({ directory: ok(statusMessage(nextStatus)) });
      await load();
    } catch (err) {
      setFormStatus({ directory: fail(extractError(err)) });
    } finally {
      setStatusSavingId(null);
    }
  }

  // REMOVE A PROFILE PHOTO (feat/profile-photos, 2026-09-30) — admin
  // REMOVE-ONLY, DELETE /users/:id/photo. The file is deleted with no undo,
  // so a native Alert names the person first (§5e; the web's modal words).
  function confirmPhotoRemove(row) {
    Alert.alert(
      `Remove photo — ${row.name}`,
      'The photo is deleted and cannot be brought back; their initials show instead. They can upload a new one from their own Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, remove the photo', style: 'destructive', onPress: () => removePhoto(row) },
      ]
    );
  }

  async function removePhoto(row) {
    setFormStatus({});
    try {
      await api.delete(`/users/${row.id}/photo`, { unwrap: 'message' });
      setFormStatus({ directory: ok(`Profile photo removed for ${row.name}.`) });
      if (row.id === me?.id) await refreshMe().catch(() => {});
      await load();
    } catch (err) {
      setFormStatus({ directory: fail(extractError(err)) });
    }
  }

  const onResetClose = useCallback(() => setResetting(null), []);
  const onResetSet = useCallback((target) => setFormStatus({ directory: ok(`Temporary password set for ${target.name}.`) }), []);

  function applyFilters() {
    setApplied(draftFilters);
  }

  function resetFilters() {
    setRole('');
    setStatus('');
    setSearch('');
    setApplied(EMPTY_FILTERS);
  }

  const empty = directoryEmpty(applied);

  const header = (
    <View className="mb-3 gap-4">
      {/* THE PENDING QUEUE */}
      <View className="gap-2">
        <Text className="text-sm font-semibold text-fg">Waiting for approval</Text>
        <Text className="text-sm text-fg-muted">A parent account stays pending until it is approved or rejected. That decision cannot be returned to pending afterward.</Text>
        <FormStatus status={formStatus.pending} />
        {pending.length === 0 && !loading ? (
          <View className="rounded-xl border border-edge bg-surface px-4 py-3">
            <Text className="text-sm font-medium text-fg">No parent accounts waiting for approval</Text>
            <Text className="mt-1 text-sm text-fg-muted">A teacher creates the account. It appears here until you approve or reject it.</Text>
          </View>
        ) : (
          pending.map((row) => (
            <RecordCard
              key={row.id}
              card={{
                onSelect: () => navigation.navigate('ReviewParent', { parent: row }),
                avatar: row.name,
                avatarPhoto: row.profile_pic,
                title: row.name,
                subtitle: `Parent of ${row.student_first_name} ${row.student_last_name}`,
                meta: `Grade ${row.grade_level} - ${row.section}`,
                status: 'pending',
              }}
            />
          ))
        )}
        {pendingPage?.has_more ? (
          <Pressable onPress={loadMorePending} accessibilityRole="button" className="items-center rounded-lg border border-edge-strong px-3 py-2">
            <Text className="text-sm text-fg-body">Show more</Text>
          </Pressable>
        ) : null}
      </View>

      {/* THE DIRECTORY */}
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold text-fg">All accounts</Text>
          <Pressable onPress={() => navigation.navigate('CreateTeacher')} accessibilityRole="button" className="rounded-lg bg-primary px-4 py-2">
            <Text className="text-sm font-medium text-primary-fg">Create teacher</Text>
          </Pressable>
        </View>
        <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
          <Segmented label="Role" value={role} onChange={setRole} options={ROLE_FILTERS} />
          <Segmented label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS} />
          {/* Matches users.name and users.login_id only — not the child's name. */}
          <FormField label="Search" placeholder="Name or login ID" value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={applyFilters} />
          <FilterActions dirty={dirty} canReset={canResetUsers(applied)} onApply={applyFilters} onReset={resetFilters} />
        </View>
        <FormStatus status={formStatus.directory} />
      </View>
    </View>
  );

  return (
    <>
      <DataList
        rows={users}
        renderCard={(row) => {
          const a = rowActions(row, me?.id);
          const busy = statusSavingId === row.id;
          const actions = [{ label: 'Edit', onPress: () => navigation.navigate('EditUser', { target: row }) }];
          if (a.reset) actions.push({ label: 'Reset password', onPress: () => setResetting(row) });
          if (a.toggle) actions.push({ label: busy ? 'Saving…' : a.toggle === 'inactive' ? 'Deactivate' : 'Activate', tone: a.toggle === 'inactive' ? 'danger' : 'neutral', onPress: busy ? () => {} : () => setUserStatus(row, a.toggle) });
          // Only on a row that has a photo (§5i).
          if (row.profile_pic) actions.push({ label: 'Remove photo', tone: 'danger', onPress: () => confirmPhotoRemove(row) });
          return {
            avatar: row.name,
            avatarPhoto: row.profile_pic,
            title: row.name,
            subtitle: row.email || null,
            meta: `${displayRole(row.role)} · ${maskLoginId(row)}${a.selfNote ? ` · ${a.selfNote}` : ''}`,
            status: row.status,
            actions,
          };
        }}
        loading={loading}
        error={error}
        onRetry={() => load()}
        refreshing={refreshing}
        onRefresh={() => load({ pull: true })}
        hasMore={Boolean(page?.has_more)}
        loadingMore={loadingMore}
        onLoadMore={loadMoreUsers}
        header={header}
        empty={{
          icon: 'fa-users-gear',
          title: empty.title,
          message: empty.message,
          action: empty.showReset ? (
            <Pressable onPress={resetFilters} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
              <Text className="text-sm text-fg-body">Reset filters</Text>
            </Pressable>
          ) : null,
        }}
      />
      <TempPasswordModal target={resetting} onClose={onResetClose} onSet={onResetSet} />
    </>
  );
}
