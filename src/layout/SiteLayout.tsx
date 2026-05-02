import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Menu, X, Instagram } from 'lucide-react';
import { CartIcon } from '../components/cart/CartIcon';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useUIStore } from '../store/uiStore';
import { PromotionProvider, usePromotions } from '../lib/promotions';
import { GiftPromotionProvider, useGiftPromotions } from '../lib/giftPromotions';
import { RouteSeo } from '../components/RouteSeo';

export function SiteLayout() {
  return (
    <PromotionProvider>
      <GiftPromotionProvider>
        <SiteLayoutInner />
      </GiftPromotionProvider>
    </PromotionProvider>
  );
}

function SiteLayoutInner() {
  const openCartOnLoad = useUIStore((state) => state.openCartOnLoad);
  const setOpenCartOnLoad = useUIStore((state) => state.setOpenCartOnLoad);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const [isNavDrawerOpen, setNavDrawerOpen] = useState(false);
  const [isNavDrawerVisible, setNavDrawerVisible] = useState(false);
  const [isNavDrawerActive, setNavDrawerActive] = useState(false);
  const [isGiftPopupOpen, setGiftPopupOpen] = useState(false);
  const location = useLocation();
  const { promotion } = usePromotions();
  const { giftPromotion } = useGiftPromotions();
  const showDiscountPromoBanner = !!promotion?.bannerEnabled && !!promotion?.bannerText?.trim();
  const showGiftPromoBanner =
    !showDiscountPromoBanner &&
    !!giftPromotion?.enabled &&
    !!giftPromotion?.bannerEnabled &&
    !!giftPromotion?.bannerText?.trim();
  const bannerText = showDiscountPromoBanner
    ? promotion?.bannerText?.trim() || ''
    : showGiftPromoBanner
    ? giftPromotion?.bannerText?.trim() || ''
    : '';
  const isHomepage = location.pathname === '/';
  const shouldShowGiftPopup = !!giftPromotion?.enabled && !!giftPromotion?.popupEnabled && isHomepage;
  const popupDismissKey = useMemo(() => {
    if (!giftPromotion?.id) return '';
    const version = giftPromotion.updatedAt || giftPromotion.createdAt || 'v1';
    return `dd_gift_popup_dismissed_${giftPromotion.id}_${version}`;
  }, [giftPromotion?.createdAt, giftPromotion?.id, giftPromotion?.updatedAt]);
  const popupRedirect = (giftPromotion?.popupRedirect || '').trim();
  const popupUsesExternalHref = /^https?:\/\//i.test(popupRedirect);

  const navLinks = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/shop', label: 'Shop' },
      { to: '/gallery', label: 'Gallery' },
      { to: '/custom-orders', label: 'Custom Orders' },
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
    ],
    []
  );

  useEffect(() => {
    if (openCartOnLoad) {
      setCartDrawerOpen(true);
      setOpenCartOnLoad(false);
    }
  }, [openCartOnLoad, setCartDrawerOpen, setOpenCartOnLoad]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavDrawerOpen(false);
      }
    };
    if (isNavDrawerOpen) {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isNavDrawerOpen]);

  useEffect(() => {
    setNavDrawerOpen(false);
  }, [location]);

  useEffect(() => {
    if (!shouldShowGiftPopup || !popupDismissKey) {
      setGiftPopupOpen(false);
      return;
    }

    try {
      const dismissedInSession = window.sessionStorage.getItem(popupDismissKey) === '1';
      const dismissedInLocal = window.localStorage.getItem(popupDismissKey) === '1';
      if (dismissedInSession || dismissedInLocal) {
        setGiftPopupOpen(false);
        return;
      }
    } catch (error) {
      console.warn('gift popup dismissal read failed', error);
    }

    const timeout = window.setTimeout(() => setGiftPopupOpen(true), 250);
    return () => window.clearTimeout(timeout);
  }, [popupDismissKey, shouldShowGiftPopup]);

  const dismissGiftPopup = () => {
    setGiftPopupOpen(false);
    if (!popupDismissKey) return;
    try {
      window.sessionStorage.setItem(popupDismissKey, '1');
      window.localStorage.setItem(popupDismissKey, '1');
    } catch (error) {
      console.warn('gift popup dismissal write failed', error);
    }
  };

  useEffect(() => {
    if (isNavDrawerOpen) {
      setNavDrawerVisible(true);
      const raf = requestAnimationFrame(() => setNavDrawerActive(true));
      return () => cancelAnimationFrame(raf);
    }
    if (isNavDrawerVisible) {
      setNavDrawerActive(false);
      const timeout = window.setTimeout(() => setNavDrawerVisible(false), 260);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [isNavDrawerOpen, isNavDrawerVisible]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <RouteSeo />
      <header className="bg-white/95 backdrop-blur border-b border-[var(--ca-border)] sticky top-0 z-30">
        {bannerText && (
          <div className="bg-sea-glass/25 text-deep-ocean text-sm font-semibold text-center py-2 px-4 tracking-wide border-b border-driftwood/60">
            {bannerText}
          </div>
        )}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                className="md:hidden p-2 hover:bg-sand/70 transition-colors border border-[var(--ca-border)] bg-white/80"
                aria-label="Open navigation menu"
                onClick={() => setNavDrawerOpen(true)}
              >
                <Menu className="h-6 w-6 text-deep-ocean" />
              </button>
              <Link
                to="/"
                className="font-serif text-xl tracking-[0.24em] text-[var(--ca-ink)] flex-1 text-center md:text-left truncate whitespace-nowrap uppercase"
              >
                COASTAL ALCHEMY
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-[11px] font-medium text-[var(--ca-muted)] hover:text-[var(--ca-ink)] transition-colors uppercase tracking-[0.28em] px-1 py-1"
                >
                  {link.label}
                </Link>
              ))}
              <CartIcon />
            </div>
            <div className="md:hidden">
              <CartIcon />
            </div>
          </div>
        </nav>
      </header>

      {isNavDrawerVisible && (
        <>
          <div
            className={`fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40 drawer-overlay motion-safe-only ${isNavDrawerActive ? 'is-open' : 'is-closed'}`}
            onClick={() => setNavDrawerOpen(false)}
          />
          <div className={`fixed left-0 top-0 h-full w-full max-w-xs bg-white shadow-xl z-50 flex flex-col menu-panel motion-safe-only ${isNavDrawerActive ? 'is-open' : 'is-closed'}`}>
            <div className="p-4 border-b border-[var(--ca-border)] flex items-center justify-between">
              <h2 className="text-lg font-serif text-[var(--ca-ink)] tracking-[0.08em]">Menu</h2>
              <button
                type="button"
                className="p-2 hover:bg-sand/70 transition-colors border border-[var(--ca-border)] bg-white/80"
                aria-label="Close navigation menu"
                onClick={() => setNavDrawerOpen(false)}
              >
                <X className="h-5 w-5 text-deep-ocean" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setNavDrawerOpen(false)}
                  className="block px-3 py-3 text-sm font-medium text-[var(--ca-muted)] hover:text-[var(--ca-ink)] hover:bg-sand/70 transition-colors uppercase tracking-[0.24em]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}

      <main className="flex-1 bg-white">
        <Outlet />
      </main>

      {isGiftPopupOpen && shouldShowGiftPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-charcoal/65 px-4">
          <div className="relative w-full max-w-lg rounded-shell-xl border border-driftwood/60 bg-white p-4 sm:p-5 shadow-2xl">
            <button
              type="button"
              onClick={dismissGiftPopup}
              className="absolute right-3 top-3 rounded-shell border border-driftwood/60 bg-white/90 p-1.5 text-charcoal/70 hover:text-charcoal"
              aria-label="Dismiss promotion popup"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="space-y-3">
              {giftPromotion?.popupImageUrl ? (
                <img
                  src={giftPromotion.popupImageUrl}
                  alt={giftPromotion.popupTitle || giftPromotion.name || 'Promotion image'}
                  className="h-44 w-full rounded-shell-lg border border-driftwood/60 object-cover bg-sand/60"
                  loading="lazy"
                />
              ) : null}
              <div className="space-y-2">
                <h3 className="text-xl font-serif font-semibold text-deep-ocean">
                  {giftPromotion?.popupTitle || giftPromotion?.name}
                </h3>
                {giftPromotion?.popupDescription ? (
                  <p className="text-sm text-charcoal/80">{giftPromotion.popupDescription}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {popupRedirect ? (
                  popupUsesExternalHref ? (
                    <a
                      href={popupRedirect}
                      className="lux-button"
                      onClick={dismissGiftPopup}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {giftPromotion?.popupButtonText || 'Shop Now'}
                    </a>
                  ) : (
                    <Link to={popupRedirect} className="lux-button" onClick={dismissGiftPopup}>
                      {giftPromotion?.popupButtonText || 'Shop Now'}
                    </Link>
                  )
                ) : null}
                <button type="button" onClick={dismissGiftPopup} className="lux-button--ghost">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-[var(--ca-border)] py-14 text-[var(--ca-ink)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr]">
            <div className="max-w-sm">
              <div className="font-serif text-2xl uppercase tracking-[0.22em]">COASTAL ALCHEMY</div>
              <p className="ca-copy mt-4 text-sm">
                Hand-painted shells and coastal pieces, made one at a time on the Gulf Coast in Naples, Florida.
              </p>
            </div>

            <div>
              <h2 className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--ca-navy)]">Explore</h2>
              <nav className="flex flex-col gap-2 text-sm text-[var(--ca-muted)]">
                <Link to="/shop" className="hover:text-[var(--ca-ink)] transition-colors">Shop</Link>
                <Link to="/gallery" className="hover:text-[var(--ca-ink)] transition-colors">Gallery</Link>
                <Link to="/custom-orders" className="hover:text-[var(--ca-ink)] transition-colors">Custom Orders</Link>
                <Link to="/about" className="hover:text-[var(--ca-ink)] transition-colors">About</Link>
              </nav>
            </div>

            <div>
              <h2 className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--ca-navy)]">Visit</h2>
              <div className="space-y-2 text-sm text-[var(--ca-muted)]">
                <p>Naples, Florida</p>
                <p>By appointment only</p>
                <Link to="/contact" className="inline-block hover:text-[var(--ca-ink)] transition-colors">Get in touch</Link>
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--ca-navy)]">Follow</h2>
              <div className="flex items-center gap-3 text-[var(--ca-muted)]">
              <a
                href="https://www.instagram.com/coastalalchemy/"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit Coastal Alchemy on Instagram"
                className="p-2 border border-[var(--ca-border)] text-[var(--ca-navy)] hover:bg-[var(--ca-paper)] transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
              </div>
              <a href="mailto:hello@coastalalchemy.com" className="mt-4 inline-block text-sm text-[var(--ca-muted)] hover:text-[var(--ca-ink)] transition-colors">
                hello@coastalalchemy.com
              </a>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-[var(--ca-border)] pt-6 text-sm text-[var(--ca-muted)] md:flex-row md:items-center md:justify-between">
            <p>&copy; 2026 Coastal Alchemy. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link to="/terms" className="hover:text-linen transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-linen transition-colors">
                Privacy
              </Link>
              <span>
                Built by{' '}
              <a
                href="https://modernizedvisions.agency"
                className="underline decoration-1 underline-offset-2 hover:text-[var(--ca-navy)] transition-colors"
              >
                Modernized Visions
              </a>
              </span>
            </div>
          </div>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}
