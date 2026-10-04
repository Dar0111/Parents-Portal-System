import { FlatList, RefreshControl, View } from 'react-native';
import Button from './Button';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';
import RecordCard from './RecordCard';
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
}) {
  const { tokens } = useTheme();
  const firstLoad = loading && !rows.length;
  const pull =
    onRefresh && !firstLoad ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />
    ) : undefined;

  let emptyContent;
  if (firstLoad) emptyContent = <LoadingSpinner className="py-12" />;
  else if (error) emptyContent = <ErrorAlert message={error} onRetry={onRetry} />;
  else emptyContent = <EmptyState icon={empty.icon} title={empty.title} message={empty.message} action={empty.action} />;

  // With rows on screen: the error (a failed "Show more" or re-read) and its
  // Retry, then "Show more" while there is more.
  const footerError = rows.length && error ? <ErrorAlert message={error} onRetry={onRetry} /> : null;
  const footerMore =
    rows.length && hasMore ? (
      <Button variant="secondary" full loading={loadingMore} onPress={onLoadMore}>
        {loadingMore ? 'Loading…' : loadMoreLabel}
      </Button>
    ) : null;
  const footer =
    footerError || footerMore ? (
      <View className="mt-4 gap-3">
        {footerError}
        {footerMore}
      </View>
    ) : null;

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, index) => String(row?.[keyField] ?? index)}
      renderItem={({ item }) => <RecordCard card={renderCard(item)} />}
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
