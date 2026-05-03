import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ContactForm } from '../components/ContactForm';
import type { HomeFeaturedCategoryTile } from '../lib/types';

export type HomeTemplateProps = {
  heroImageUrls?: string[];
  heroRotationEnabled?: boolean;
  aboutImageUrl?: string;
  customOrdersMainImageUrl?: string;
  featuredTiles?: HomeFeaturedCategoryTile[];
};

export default function HomeTemplate({
  heroImageUrls = [],
  heroRotationEnabled = false,
  aboutImageUrl,
  customOrdersMainImageUrl,
  featuredTiles = [],
}: HomeTemplateProps) {
  const activeHeroImages = heroImageUrls.filter(Boolean);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroImage = activeHeroImages[heroIndex % activeHeroImages.length] || '/images/large-shell-frame.png';
  const studioImage = aboutImageUrl || '/images/shell-collection-flatlay.png';
  const customImage = customOrdersMainImageUrl || '/images/shell-frame-staged.png';
  const featured = featuredTiles.slice(0, 4);

  useEffect(() => {
    setHeroIndex(0);
  }, [activeHeroImages.length]);

  useEffect(() => {
    if (!heroRotationEnabled || activeHeroImages.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % activeHeroImages.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [activeHeroImages.length, heroRotationEnabled]);

  return (
    <div className="ca-page pb-[88px] md:pb-0">
      <section className="border-b border-[var(--ca-border)] bg-white">
        <div className="ca-container grid min-h-[78vh] grid-cols-1 items-center gap-10 py-12 md:grid-cols-[1fr_1.15fr] md:py-16 lg:gap-20">
          <div className="max-w-xl text-center md:text-left mx-auto md:mx-0">
            <div className="ca-eyebrow mb-6">Hand-Painted · Naples, Florida</div>
            <h1 className="ca-hero-title mb-6">
              Quiet pieces from
              <br />
              the Gulf Coast.
            </h1>
            <p className="ca-copy mb-8 max-w-lg mx-auto md:mx-0 text-lg">
              Coastal Alchemy is a small studio of hand-painted shells, framed collections, and tabletop pieces - made one at a time, the way the ocean made them.
            </p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <Link to="/shop" className="ca-button ca-button-filled">
                Shop the Collection
              </Link>
              <Link to="/custom-orders" className="ca-button">
                Commission a Piece
              </Link>
            </div>
          </div>

          <div className="relative aspect-[4/5] overflow-hidden bg-white">
            <img
              src={heroImage}
              alt="Large framed shell collection styled in a bright coastal living room"
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
            <div className="absolute bottom-5 left-5 bg-white/95 px-4 py-3 text-[0.68rem] uppercase tracking-[0.26em] text-[var(--ca-muted)]">
              The Gulf Collection · No. 12
            </div>
          </div>
        </div>
      </section>

      <div className="ca-container flex flex-wrap justify-center gap-x-12 gap-y-4 border-b border-[var(--ca-border)] py-6 text-center text-[0.7rem] uppercase tracking-[0.32em] text-[var(--ca-muted)]">
        <span>Made by hand</span>
        <span>One of one</span>
        <span>Shipped from Naples, FL</span>
        <span>Custom commissions welcome</span>
      </div>

      <section className="ca-section">
        <div className="ca-container ca-split">
          <div className="ca-media">
            <img src={studioImage} alt="Hand placing painted shells on a canvas" loading="lazy" />
          </div>
          <div>
            <div className="ca-eyebrow mb-4">The Studio</div>
            <h2 className="ca-section-title mb-5">A slow practice, on the gulf.</h2>
            <p className="ca-copy">
              Each piece begins on a long walk - collecting scallops, oysters, and the small, strange shells the tide leaves on Naples beaches. They're cleaned, cured, and painted by hand in soft, layered washes, then finished simply, deliberately.
            </p>
            <p className="ca-copy">
              The result is a piece of the coast you can keep on a shelf, a wall, or a tablescape - quiet, considered, and made to last.
            </p>
            <Link to="/about" className="ca-button ca-button-ghost mt-3">
              About Coastal Alchemy
            </Link>
          </div>
        </div>
      </section>

      <section className="ca-section border-y border-[var(--ca-border)]">
        <div className="ca-container">
          <div className="mb-12 text-center">
            <div className="ca-eyebrow mb-4">Featured Pieces</div>
            <h2 className="ca-section-title">A few favorites from the studio</h2>
          </div>
          <div className="ca-grid ca-grid-4">
            {featured.length ? featured.map((tile, index) => {
              const categorySlug = (tile.categorySlug || '').trim();
              const href = !categorySlug || categorySlug === 'all'
                ? '/shop'
                : `/shop?category=${encodeURIComponent(categorySlug)}`;
              return (
              <article className="ca-card ca-feature-tile" key={`${tile.categorySlug || 'all'}-${index}`}>
                <Link to={href} className="ca-card-media" aria-label={`Shop ${tile.title}`}>
                  <img src={tile.imageUrl || '/images/shell-frame-detail.png'} alt={tile.title || 'Featured category'} loading="lazy" />
                </Link>
                <div className="ca-card-body">
                  <div className="ca-card-meta">Shop Category</div>
                  <Link to={href} className="ca-card-title transition hover:text-[var(--ca-navy)]">{tile.title}</Link>
                </div>
              </article>
              );
            }) : (
              <div className="col-span-full ca-copy text-center text-sm">
                Featured categories will appear here when they are configured in admin.
              </div>
            )}
          </div>
          <div className="mt-12 text-center">
            <Link to="/shop" className="ca-button">
              Shop All
            </Link>
          </div>
        </div>
      </section>

      <section className="ca-section">
        <div className="ca-container ca-split">
          <div>
            <div className="ca-eyebrow mb-4">Custom Orders</div>
            <h2 className="ca-section-title mb-5">Commission something for the room you're building.</h2>
            <p className="ca-copy">
              I take a small number of custom commissions each season - framed shell collections sized to your wall, palettes built around your fabrics, sets of painted shells for a beach house, or a single meaningful piece for a wedding gift.
            </p>
            <p className="ca-copy">
              Tell me about the room, the colors, the moment. I'll come back with a sketch and a quote.
            </p>
            <Link to="/custom-orders" className="ca-button ca-button-filled">
              Start an Inquiry
            </Link>
          </div>
          <div className="ca-media">
            <img src={customImage} alt="A framed shell collection on a styled console" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="ca-callout">
        <div className="ca-container max-w-3xl">
          <div className="ca-eyebrow mb-4">From a recent client</div>
          <h2 className="ca-section-title italic">
            "She painted a shadow box for the front hall of our beach house in Port Royal - it's the first thing every guest stops in front of, and it feels completely ours."
          </h2>
          <div className="mt-5 text-[0.7rem] uppercase tracking-[0.22em] text-[var(--ca-muted)]">
            Mary Beth K. · Naples, FL
          </div>
        </div>
      </section>

      <section className="ca-section">
        <div className="ca-container ca-split items-start">
          <div>
            <div className="ca-eyebrow mb-4">Say Hello</div>
            <h2 className="ca-section-title mb-5">Reach out.</h2>
            <p className="ca-copy">
              For commissions, press, or just to talk shells - I read every note and reply within a few days.
            </p>
            <p className="ca-copy mt-8 leading-8">
              <strong className="block font-serif text-xl font-normal tracking-[0.06em] text-[var(--ca-ink)]">
                Coastal Alchemy
              </strong>
              Naples, Florida
              <br />
              hello@coastalalchemy.com
              <br />
              By appointment only
            </p>
          </div>
          <div className="ca-form-skin">
            <ContactForm backgroundColor="transparent" variant="embedded" />
          </div>
        </div>
      </section>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ca-border)] bg-white px-4 py-3 md:hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <Link to="/shop" className="ca-button ca-button-filled w-full">
          Shop Collection
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
