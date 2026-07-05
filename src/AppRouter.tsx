import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ExplorePage } from "./pages/ExplorePage";
import { MessagesPage } from "./pages/MessagesPage";
import { ListFeedPage } from "./pages/ListFeedPage";
import { CommunityPage } from "./pages/CommunityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MainLayout } from "./components/layout/MainLayout";

/**
 * Derive the router basename from the actual URL of the page.
 *
 * With `base: './'` in vite.config.ts the compiled HTML is served from
 * whatever subdirectory the host puts it in (e.g. /mixstr/ on GitHub Pages).
 * `import.meta.env.BASE_URL` only returns "./" in that case — not useful as a
 * React Router basename.  Instead we look at the real URL: if the page was
 * loaded from https://example.com/mixstr/ we want basename="/mixstr/".
 *
 * The script tag that bootstraps the app will have a src like
 * "./assets/main-xxx.js", so `document.currentScript` always points at the
 * correct origin-relative directory.  We fall back to `location.pathname`
 * stripped of any trailing non-directory segment, which covers the 404.html
 * redirect case used by GitHub Pages SPAs.
 */
function getBasename(): string {
  // Walk up from the current URL until we find a path segment that contains
  // the app's index page.  The simplest heuristic: take everything up to (and
  // including) the last "/" in pathname that is NOT just a NIP-19 identifier.
  // For a GitHub Pages deployment at /mixstr/ the pathname on first load is
  // "/mixstr/" → basename is "/mixstr/".
  // For a root deployment the pathname is "/" → basename is "/".
  const { pathname } = window.location;
  // Strip any trailing path segment that looks like a route (no trailing slash)
  const base = pathname.endsWith('/') ? pathname : pathname.substring(0, pathname.lastIndexOf('/') + 1);
  return base || '/';
}

export function AppRouter() {
  return (
    <BrowserRouter basename={getBasename()}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />

        <Route
          path="/notifications"
          element={
            <MainLayout>
              <NotificationsPage />
            </MainLayout>
          }
        />

        <Route
          path="/explore"
          element={
            <MainLayout>
              <ExplorePage />
            </MainLayout>
          }
        />

        <Route
          path="/messages"
          element={
            <MainLayout>
              <MessagesPage />
            </MainLayout>
          }
        />

        <Route
          path="/messages/:recipient"
          element={
            <MainLayout>
              <MessagesPage />
            </MainLayout>
          }
        />

        {/* User-configured sidebar lists */}
        <Route
          path="/list/:id"
          element={
            <MainLayout>
              <ListFeedPage />
            </MainLayout>
          }
        />

        {/* NIP-72 communities */}
        <Route
          path="/community/:addr"
          element={
            <MainLayout>
              <CommunityPage />
            </MainLayout>
          }
        />

        {/* App settings */}
        <Route
          path="/settings"
          element={
            <MainLayout>
              <SettingsPage />
            </MainLayout>
          }
        />

        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
