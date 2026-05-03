import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicSiteContentHome } from '../lib/publicApi';
import type { HomeSiteContent } from '../lib/types';

export function AboutPage() {
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const content = await getPublicSiteContentHome();
        if (!cancelled) {
          setHomeContent(content || {});
        }
      } catch (err) {
        console.error('Failed to load about images', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const aboutImage = homeContent?.aboutImages?.about || '/images/shell-detail-pearls.png';
  const aboutImage2 = homeContent?.aboutImages?.aboutPage2 || '/images/shell-frame-staged.png';

  return (
    <div className="ca-page">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">About</div>
        <h1>The studio, the shells, the why.</h1>
      </header>

      <section className="ca-section">
        <div className="ca-container ca-split">
          <div className="ca-media">
            <img src={aboutImage} alt="A close detail of a hand-painted scallop" loading="lazy" />
          </div>
          <div>
            <div className="ca-eyebrow mb-4">Made on the Gulf</div>
            <h2 className="ca-section-title mb-5">A practice that started with a walk.</h2>
            <p className="ca-copy">
              Coastal Alchemy began the way most slow things do - on a long, quiet walk down a Naples beach with a pocketful of shells and nowhere to be.
            </p>
            <p className="ca-copy">
              What started as a small series of painted scallops on a kitchen counter has grown into a studio practice: framed shell collections, hand-painted tabletop pieces, and custom commissions that live in front halls and on dining tables for a long time.
            </p>
            <p className="ca-copy">
              Every shell is sourced by hand, almost always from the Gulf Coast of Florida. Each piece is painted, finished, and signed in the studio - one at a time, never in bulk.
            </p>
          </div>
        </div>
      </section>

      <section className="ca-section border-y border-[var(--ca-border)]">
        <div className="ca-container ca-grid ca-grid-3 ca-mobile-center-grid">
          <div>
            <div className="ca-eyebrow mb-3">Sourced</div>
            <h3 className="ca-card-title mb-3">Mostly Gulf Coast</h3>
            <p className="ca-copy">Florida scallops, oysters, and the small, strange shells the tide leaves behind. A few traveled friends, but most are local.</p>
          </div>
          <div>
            <div className="ca-eyebrow mb-3">Painted</div>
            <h3 className="ca-card-title mb-3">By hand, in layers</h3>
            <p className="ca-copy">Soft washes built up slowly, finished in gold or left deliberately bare. No two pieces are exactly the same.</p>
          </div>
          <div>
            <div className="ca-eyebrow mb-3">Made</div>
            <h3 className="ca-card-title mb-3">In Naples, FL</h3>
            <p className="ca-copy">Cured, painted, framed and packed in a small studio on the Gulf. Shipped, by hand, from here.</p>
          </div>
        </div>
      </section>

      <section className="ca-section">
        <div className="ca-container ca-split">
          <div>
            <div className="ca-eyebrow mb-4">Where you'll find the work</div>
            <h2 className="ca-section-title mb-5">In a few places, on purpose.</h2>
            <p className="ca-copy">
              Coastal Alchemy isn't a wholesale brand. The work lives in private homes, a small handful of design projects with Naples and 30A interior designers, and the occasional pop-up.
            </p>
            <p className="ca-copy">
              If you're a designer or a stylist with a project in mind, I'd love to hear about it.
            </p>
          </div>
          <div className="ca-media">
            <img src={aboutImage2} alt="A styled console with a framed shell piece" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="ca-callout">
        <div className="ca-container">
          <h3 className="ca-section-title mx-auto max-w-3xl italic">Want a piece that feels like your home?</h3>
          <p className="ca-copy mx-auto mb-8 max-w-xl">
            Custom orders are how most of my favorite work happens. Send a few photos, share the vibe, and we'll go from there.
          </p>
          <Link to="/custom-orders" className="ca-button">
            Start a custom inquiry
          </Link>
        </div>
      </section>
    </div>
  );
}
