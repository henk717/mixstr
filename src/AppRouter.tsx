import { HashRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ExplorePage } from "./pages/ExplorePage";
import { MessagesPage } from "./pages/MessagesPage";
import { ListFeedPage } from "./pages/ListFeedPage";
import { CommunityPage } from "./pages/CommunityPage";
import { HashtagFeedPage } from "./pages/HashtagFeedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MainLayout } from "./components/layout/MainLayout";

export function AppRouter() {
  return (
    <HashRouter>
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

        {/* Hashtag feeds */}
        <Route
          path="/t/:tag"
          element={
            <MainLayout>
              <HashtagFeedPage />
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
    </HashRouter>
  );
}
export default AppRouter;
