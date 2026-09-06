import { createContext, useContext, useEffect } from 'react';

// Shell owns the actual state and renders this provider around <Outlet />.
// A page that needs a title the nav cannot supply — a detail view like
// /teacher/grades/12, or anything with a record name in the header — calls
// usePageTitle('...'); everything else gets its title from nav.js by path.
export const PageTitleContext = createContext(null);

export function usePageTitle(title) {
  // Read setTitle directly rather than the whole context value: useState
  // setters are referentially stable, so the effect below runs on a real
  // title change instead of on every render of the provider.
  const setTitle = useContext(PageTitleContext)?.setTitle;

  useEffect(() => {
    if (!setTitle) return undefined;
    setTitle(title);
    // Clear on unmount so navigating away from a detail page falls back to
    // the nav-derived title instead of stranding the old one in the header.
    return () => setTitle(null);
  }, [setTitle, title]);
}
