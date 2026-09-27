import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
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
  // container; the other three pad here.
  const gutter = 'px-4 pt-4';

  if (loading && !rows.length) {
    return (
      <View className={`flex-1 ${gutter}`}>
        {header}
        <LoadingSpinner className="py-12" />
      </View>
    );
  }

  if (error) {
    return (
      <View className={`flex-1 ${gutter}`}>
        {header}
        <ErrorAlert message={error} onRetry={onRetry} />
      </View>
    );
  }

  if (!rows.length) {
    return (
      <View className={`flex-1 ${gutter}`}>
        {header}
        <EmptyState icon={empty.icon} title={empty.title} message={empty.message} action={empty.action} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, index) => String(row?.[keyField] ?? index)}
      renderItem={({ item }) => <RecordCard card={renderCard(item)} />}
      ItemSeparatorComponent={() => <View className="h-2" />}
      ListHeaderComponent={header}
      ListFooterComponent={
        hasMore ? (
          <Pressable
            onPress={onLoadMore}
            disabled={loadingMore}
            accessibilityRole="button"
            className={`mt-3 items-center rounded-lg border border-edge-strong px-3 py-2 ${loadingMore ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm text-fg-body">{loadingMore ? 'Loading…' : loadMoreLabel}</Text>
          </Pressable>
        ) : null
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />
        ) : undefined
      }
      contentContainerStyle={[{ padding: 16 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
    />
  );
}
