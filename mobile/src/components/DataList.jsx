import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
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

  // THE HEADER KEEPS THE LIST'S 16px GUTTER IN EVERY BRANCH (phone check
  // finding, 2026-09-27): the empty branch rendered it flush against the
  // screen edge, so "New message" had no right margin before the first
  // conversation existed. The FlatList branch pads through its content
  // container; the other three pad through theirs.
  //
  // THOSE THREE SCROLL (feat/ui-refresh, 2026-10-02). They were a plain View,
  // and a screen's header — a section title, filters, 48dp controls — is now
  // tall enough that on a short phone the empty state or the error under it
  // could fall below the fold with no way to reach it. A ScrollView with the
  // same gutter keeps everything reachable, and the error and empty states
  // take the same pull-to-refresh the list has, so a list that came back
  // empty can be asked again the same way.
  const pull = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />
  ) : undefined;
  const frame = { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 };

  if (loading && !rows.length) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={frame} keyboardShouldPersistTaps="handled">
        {header}
        <LoadingSpinner className="py-12" />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={frame} keyboardShouldPersistTaps="handled" refreshControl={pull}>
        {header}
        <ErrorAlert message={error} onRetry={onRetry} />
      </ScrollView>
    );
  }

  if (!rows.length) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={frame} keyboardShouldPersistTaps="handled" refreshControl={pull}>
        {header}
        <EmptyState icon={empty.icon} title={empty.title} message={empty.message} action={empty.action} />
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, index) => String(row?.[keyField] ?? index)}
      renderItem={({ item }) => <RecordCard card={renderCard(item)} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListHeaderComponent={header}
      ListFooterComponent={
        hasMore ? (
          <Button variant="secondary" full loading={loadingMore} onPress={onLoadMore} className="mt-4">
            {loadingMore ? 'Loading…' : loadMoreLabel}
          </Button>
        ) : null
      }
      refreshControl={pull}
      contentContainerStyle={[{ padding: 16 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
    />
  );
}
