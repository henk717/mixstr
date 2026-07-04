import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ExplorePage } from "./pages/ExplorePage";
import { HashtagFeedPage } from "./pages/HashtagFeedPage";
import { DvmFeedPage } from "./pages/DvmFeedPage";
import { MainLayout } from "./components/layout/MainLayout";

export function AppRouter() {
  return (
    <BrowserRouter>
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
          path="/t/:tag"
          element={
            <MainLayout>
              <HashtagFeedPage />
            </MainLayout>
          }
        />
        <Route
          path="/dvm/:id"
          element={
            <MainLayout>
              <DvmFeedPage />
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
