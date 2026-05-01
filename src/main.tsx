import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SiteLayout } from './layout/SiteLayout';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ScrollToTop } from './components/ScrollToTop';
import { AnalyticsRouteTracker } from './components/AnalyticsRouteTracker';
import './index.css';

const ShopPage = lazy(() => import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })));
const GalleryPage = lazy(() => import('./pages/GalleryPage').then((m) => ({ default: m.GalleryPage })));
const CustomOrdersPage = lazy(() => import('./pages/CustomOrdersPage'));
const EmailListPage = lazy(() => import('./pages/EmailListPage').then((m) => ({ default: m.EmailListPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const TermsPage = lazy(() => import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })));
const AdminAnalyticsPage = lazy(() =>
  import('./pages/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage }))
);
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const CheckoutReturnPage = lazy(() => import('./pages/CheckoutReturnPage').then((m) => ({ default: m.CheckoutReturnPage })));

const RouteLoading = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-sm opacity-80">
    Loading...
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <AnalyticsRouteTracker />
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="shop"
            element={
              <Suspense fallback={<RouteLoading />}>
                <ShopPage />
              </Suspense>
            }
          />
          <Route
            path="product/:productId"
            element={
              <Suspense fallback={<RouteLoading />}>
                <ProductDetailPage />
              </Suspense>
            }
          />
          <Route
            path="gallery"
            element={
              <Suspense fallback={<RouteLoading />}>
                <GalleryPage />
              </Suspense>
            }
          />
          <Route
            path="custom-orders"
            element={
              <Suspense fallback={<RouteLoading />}>
                <CustomOrdersPage />
              </Suspense>
            }
          />
          <Route
            path="join"
            element={
              <Suspense fallback={<RouteLoading />}>
                <EmailListPage />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="contact"
            element={
              <Suspense fallback={<RouteLoading />}>
                <ContactPage />
              </Suspense>
            }
          />
          <Route
            path="terms"
            element={
              <Suspense fallback={<RouteLoading />}>
                <TermsPage />
              </Suspense>
            }
          />
          <Route
            path="privacy"
            element={
              <Suspense fallback={<RouteLoading />}>
                <PrivacyPage />
              </Suspense>
            }
          />
          <Route
            path="checkout"
            element={
              <Suspense fallback={<RouteLoading />}>
                <CheckoutPage />
              </Suspense>
            }
          />
          <Route
            path="checkout/return"
            element={
              <Suspense fallback={<RouteLoading />}>
                <CheckoutReturnPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AdminLoginPage />
              </Suspense>
            }
          />
          <Route
            path="admin/login"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AdminLoginPage />
              </Suspense>
            }
          />
          <Route
            path="admin/analytics"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AdminAnalyticsPage />
              </Suspense>
            }
          />
          <Route
            path="admin/*"
            element={
              <Suspense fallback={<RouteLoading />}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
