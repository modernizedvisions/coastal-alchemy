import { Link } from 'react-router-dom';
import { ContactForm } from '../components/ContactForm';
import { EmailListSignupSection } from '../components/email-list/EmailListSignupSection';
import type { HomeGalleryItem } from '../lib/types';

export type HomeTemplateProps = {
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  homeGalleryItems?: HomeGalleryItem[];
  aboutImageUrl?: string;
};

const fallbackGallery = [
  '/images/shell-frame-detail.png',
  '/images/napkin-ring-floral.png',
  '/images/scallop-bowl.png',
  '/images/shell-frame-table.png',
];

const fallbackFeatured = [
  { image: '/images/shell-frame-detail.png', title: 'Petite Study', meta: 'Framed Shells' },
  { image: '/images/napkin-ring-floral.png', title: 'Botanical Napkin Ring', meta: 'Tabletop' },
  { image: '/images/scallop-bowl.png', title: 'Sage Scallop Catch-All', meta: 'Painted Shells' },
  { image: '/images/shell-frame-table.png', title: 'Mini Trio Frame', meta: 'Framed Shells' },
];

export default function HomeTemplate({ heroImageUrl, galleryImageUrls, homeGalleryItems, aboutImageUrl }: HomeTemplateProps) {
  const heroImage = heroImageUrl || '/images/large-shell-frame.png';
  const studioImage = aboutImageUrl || '/images/shell-collection-flatlay.png';
  const customImage = '/images/shell-frame-staged.png';
  const gallerySource = homeGalleryItems?.length
    ? homeGalleryItems.map((item) => ({
        image: item.imageUrl,
        title: item.descriptor || 'Coastal Alchemy piece',
        meta: 'Studio Work',
      }))
    : (galleryImageUrls?.length ? galleryImageUrls : fallbackGallery).map((image, index) => ({
        image,
        title: fallbackFeatured[index % fallbackFeatured.length].title,
        meta: fallbackFeatured[index % fallbackFeatured.length].meta,
      }));
  const featured = gallerySource.filter((item) => item.image).slice(0, 4);

  return (
    <div className="ca-page">
      <section className="border-b border-[var(--ca-border)] bg-white">
        <div className="ca-container grid min-h-[78vh] grid-cols-1 items-center gap-10 py-12 md:grid-cols-[1fr_1.15fr] md:py-16 lg:gap-20">
          <div className="max-w-xl">
            <div className="ca-eyebrow mb-6">Hand-Painted · Naples, Florida</div>
            <h1 className="ca-hero-title mb-6">
              Quiet pieces from
              <br />
              the Gulf Coast.
            </h1>
            <p className="ca-copy mb-8 max-w-lg text-lg">
              Coastal Alchemy is a small studio of hand-painted shells, framed collections, and tabletop pieces - made one at a time, the way the ocean made them.
            </p>
            <div className="flex flex-wrap gap-3">
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
            {(featured.length ? featured : fallbackFeatured).map((item, index) => (
              <article className="ca-card" key={`${item.title}-${index}`}>
                <Link to="/shop" className="ca-card-media">
                  <img src={item.image} alt={item.title} loading="lazy" />
                </Link>
                <div className="ca-card-body">
                  <div className="ca-card-meta">{item.meta}</div>
                  <div className="ca-card-title">{item.title}</div>
                </div>
              </article>
            ))}
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

      <section className="ca-section-tight border-t border-[var(--ca-border)]">
        <div className="ca-container max-w-4xl">
          <EmailListSignupSection />
        </div>
      </section>
    </div>
  );
}
