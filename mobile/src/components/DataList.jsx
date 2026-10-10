import { FlatList, RefreshControl, View } from 'react-native';
import Button from './Button';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import RecordCard from './RecordCard';
import Skeleton, { SkeletonBar, SkeletonCircle } from './Skeleton';
import { cardClass } from './buttonStyles';
import { useQueryRows, useSkeleton } from '../hooks/useSkeleton';
import { useTheme } from '../theme/ThemeProvider';

// THE PHONE'S DataTable (MOBILE_CONVENTIONS M11): presentational, never
// fetches. The screen owns `rows` / `loading` / `error` and passes a
// `renderCard(row)` that returns the web's card DATA. Loading, error and
// empty render inside the frame. Two paging shapes, both the caller's:
// `hasMore` + `onLoadMore` renders a "Show more" footer against the API's
// `page.has_more` (the web's pager, one direction), and `onRefresh` gives
// every list pull-to-refresh (decision 4). Nothing is sorted here: a list
// arrives in the server's order.
//
// "Show more" is the shared `Button` (feat/ui-refresh, 2026-10-02): full
// width, 48dp, and while the next page loads it is disabled with a spinner
// beside the same "Loading…" label it always showed.
//
// ONE FlatList, WHATEVER THE STATE (feat/look-fixes, 2026-10-05). Loading,
// the error and the empty state are the list's EMPTY content, and the header
// is always its `ListHeaderComponent` — so the screen's filter header is the
// same mounted element in every state. It was a ScrollView in three of the
// four branches and the FlatList in the fourth, so a filter that took the
// list from rows to none (or back) remounted the header: Search lost its
// focus and the keyboard, and the scroll jumped to the top.
//
// A FAILED "SHOW MORE" KEEPS THE ROWS. An error that arrives while rows are on
// screen renders in the FOOTER — its Retry is the screen's own re-read, and
// "Show more" stays under it while the list still has more, so the failed page
// can be asked for again — and the loaded rows stay where they were. It used
// to replace the whole list with the error. (The list cannot tell a failed
// page from a failed re-read; offering both is honest either way.)
//
// THE HEADER KEEPS THE LIST'S 16px GUTTER (phone check finding, 2026-09-27):
// the content container pads everything, header and empty states included.
// Every state scrolls and takes pull-to-refresh, so a list that came back
// empty or failed can be asked again the same way (feat/ui-refresh) — except
// the first load, which has nothing to pull yet.
//
// LOADING IS TWO THINGS SINCE BUILD 2 (feat/dashboards-look, 2026-10-07):
//
//   NOTHING ON SCREEN gets the SKELETON (components/Skeleton.jsx): three
//   card-shaped blocks, the list's own cards' frame, painted after 300 ms
//   (hooks/useSkeleton.js) — as the list's empty content, so the header and
//   its filters stay the same mounted element.
//
//   ROWS ON SCREEN — a re-read, a pull, or a filter applied while the old
//   rows are still there — KEEPS THEM, and makes them safe. The list always
//   kept its rows; until build 2 they stayed PRESSABLE while the next answer
//   was on its way, so a card for a student the new filter had already left
//   out could still be opened (the owner's question, answered yes). Now each
//   card and the footer take no touches and are hidden from the screen reader
//   while the list loads, and after the same 300 ms they are greyed, so a
//   slow re-read is seen. The header is NOT made inert: its filters must
//   stay usable while the list loads.
//
// A RE-READ OR A NEW QUERY — `queryKey` (option 1, feat/skeleton-querykey,
// 2026-10-11; the web DataTable's rule). A screen hands the list rows and
// `loading`, never its filters, so on its own the list keeps WHATEVER rows are
// on screen while it loads. A screen whose query can change passes `queryKey`
// — the values its load reads — and the rows then belong to the key they
// arrived under (hooks/useSkeleton.js, `useQueryRows`, mirrored): the SAME key
// loading again keeps them (a pull, a reconnect re-read, "Show more"
// appending); a NEW key means nothing of that query is on screen, so the list
// shows its skeleton — from the render the key changes in — and never the old
// cards. No `queryKey`: exactly as before. A keyed screen passes a stable rows
// array (its state).
//
// AN AVATAR WHERE THE CARDS HAVE ONE (fix round F4, 2026-10-08): a screen
// whose cards carry `avatar` says so with `skeletonAvatar`, and each card
// placeholder leads with a circle of RecordCard's Avatar size (38dp) — the
// web DataTable's rule. The list cannot know before a row exists. Users, both
// Students screens, admin Attendance, teacher Attendance records, teacher
// Excuse Letters and both Messages screens say it.
const SKELETON_CARDS = ['w-2/3', 'w-1/2', 'w-3/4'];
const SKELETON_AVATAR = 38;
const BUSY_DIM = { opacity: 0.6 };
// The list's data while its rows are another query's: none, so FlatList
// shows its empty content — the skeleton.
const NO_ROWS = [];

function ListSkeleton({ phase, avatar }) {
  return (
    <Skeleton phase={phase}>
      <View className="gap-3">
        {SKELETON_CARDS.map((w, i) => (
          <View key={i} className={`${cardClass} flex-row items-start gap-3 p-4`}>
            {avatar ? <SkeletonCircle size={SKELETON_AVATAR} /> : null}
            <View className="min-w-0 flex-1">
              <View className="h-6 justify-center">
                <SkeletonBar className={`h-3.5 ${w}`} />
              </View>
              <View className="mt-0.5 h-5 justify-center">
                <SkeletonBar className="h-3 w-1/2" />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

export default function DataList({
  rows,
  keyField = 'id',
  renderCard,
  loading = false,
  error = null,
  onRetry = null,
  refreshing = false,
  onRefresh = null,
  hasMore = false,
  onLoadMore = null,
  loadingMore = false,
  loadMoreLabel = 'Show more',
  empty = {},
  header = null,
  contentContainerStyle,
  // The cards lead with an avatar: the skeleton's cards do too (F4).
  skeletonAvatar = false,
  // Which query the screen shows — the values its load reads (option 1; see
  // above). Omitted = whatever rows are on screen are current.
  queryKey = undefined,
}) {
  const { tokens } = useTheme();
  // OPTION 1: rows another query left on screen are not shown; the skeleton
  // stands in until this query's rows arrive (an error still shows first).
  const rowsCurrent = useQueryRows(rows, loading, queryKey);
  const shown = rowsCurrent ? rows : NO_ROWS;
  const firstLoad = (loading || (!rowsCurrent && !error)) && !shown.length;
  // Rows on screen while the list loads: kept, untouchable, greyed after 300 ms.
  const busy = loading && shown.length > 0;
  const skeleton = useSkeleton(firstLoad);
  const dimmed = useSkeleton(busy) === 'skeleton';
  const pull =
    onRefresh && !firstLoad ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />
    ) : undefined;
  // What makes a kept row safe: no touches, out of the screen reader's reach
  // (the phone's `inert`), and greyed once the read has taken 300 ms.
  const keep = {
    pointerEvents: busy ? 'none' : 'auto',
    importantForAccessibility: busy ? 'no-hide-descendants' : 'auto',
    accessibilityElementsHidden: busy,
    style: dimmed ? BUSY_DIM : undefined,
  };

  let emptyContent;
  if (firstLoad) emptyContent = <ListSkeleton phase={skeleton} avatar={skeletonAvatar} />;
  else if (error) emptyContent = <ErrorAlert message={error} onRetry={onRetry} />;
  else emptyContent = <EmptyState icon={empty.icon} title={empty.title} message={empty.message} action={empty.action} />;

  // With rows on screen: the error (a failed "Show more" or re-read) and its
  // Retry, then "Show more" while there is more.
  const footerError = shown.length && error ? <ErrorAlert message={error} onRetry={onRetry} /> : null;
  const footerMore =
    shown.length && hasMore ? (
      <Button variant="secondary" full loading={loadingMore} onPress={onLoadMore}>
        {loadingMore ? 'Loading…' : loadMoreLabel}
      </Button>
    ) : null;
  const footer =
    footerError || footerMore ? (
      <View className="mt-4 gap-3" {...keep}>
        {footerError}
        {footerMore}
      </View>
    ) : null;

  // `extraData`: a row's own data does not change when the list starts or
  // stops loading, so FlatList is told to re-render its cells then.
  return (
    <FlatList
      data={shown}
      extraData={busy ? (dimmed ? 'dimmed' : 'busy') : 'idle'}
      keyExtractor={(row, index) => String(row?.[keyField] ?? index)}
      renderItem={({ item }) => (
        <View {...keep}>
          <RecordCard card={renderCard(item)} />
        </View>
      )}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyContent}
      ListFooterComponent={footer}
      refreshControl={pull}
      contentContainerStyle={[{ padding: 16 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
    />
  );
}
