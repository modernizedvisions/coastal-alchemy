import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchCustomOrderExamples, getPublicSiteContentHome } from '../lib/publicApi';
import type { CustomOrderExample } from '../lib/publicApi';
import { ContactForm } from '../components/ContactForm';
import type { HomeSiteContent } from '../lib/types';

const skeletonExamples = Array.from({ length: 6 });
const steps = [
  {
    n: '01',
    title: 'Tell me the vibe',
    body: "Send a note with the room, the palette, the mood. Inspiration photos, paint chips, or fabric snaps are welcome - anything that helps me see what you're imagining.",
  },
  {
    n: '02',
    title: 'I sketch and quote',
    body: "Within about a week I'll come back with a small sketch or palette study, a recommended size, and a quote. We refine until it feels right.",
  },
  {
    n: '03',
    title: 'I paint, you wait',
    body: 'Most pieces take 4-8 weeks. I share progress photos along the way so you stay in the loop without having to ask.',
  },
  {
    n: '04',
    title: 'It arrives',
    body: 'Your piece is packed by hand and shipped from Naples, fully insured. Local clients are welcome to pick up at the studio.',
  },
];

export default function CustomOrdersPage() {
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [selectedItem, setSelectedItem] = useState<CustomOrderExample | null>(null);
  const contactBg = '#ffffff';
  const [examples, setExamples] = useState<CustomOrderExample[]>([]);
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);
  const [isLoadingExamples, setIsLoadingExamples] = useState(true);
  const [examplesError, setExamplesError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadExamples = async () => {
      try {
        setIsLoadingExamples(true);
        const [data, content] = await Promise.all([
          fetchCustomOrderExamples(),
          getPublicSiteContentHome(),
        ]);
        if (!isMounted) return;
        setExamples(Array.isArray(data) ? data : []);
        setHomeContent(content || {});
        setExamplesError(null);
      } catch (_err) {
        if (!isMounted) return;
        setExamples([]);
        setExamplesError('Examples are loading soon.');
      } finally {
        if (isMounted) setIsLoadingExamples(false);
      }
    };
    void loadExamples();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleScrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRequestFromModal = () => {
    setSelectedItem(null);
    handleScrollToForm();
  };
  const customOrdersMainImage = homeContent?.customOrdersMainImage || '/images/large-shell-frame.png';

  return (
    <div className="ca-page w-full overflow-hidden">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">Custom Orders</div>
        <h1>Made for your room.</h1>
        <p className="ca-copy mx-auto mt-4 max-w-2xl">
          Most of my favorite work has started with a single email. Tell me what you're imagining, and we'll build it from there.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#custom-order-request" className="ca-button ca-button-filled w-full sm:w-auto">
            Start Your Request
          </a>
          <a href="#past-custom-pieces" className="ca-button ca-button-ghost w-full sm:w-auto">
            Browse Past Customs
          </a>
        </div>
      </header>

      <section className="ca-section">
        <div className="ca-container">
          <div className="mb-12 text-center">
            <div className="ca-eyebrow mb-4">The Process</div>
            <h2 className="ca-section-title">How a commission comes together</h2>
          </div>
          <div className="ca-grid ca-grid-4 ca-mobile-center-grid">
            {steps.map((step) => (
              <div key={step.n} className="border-t border-[var(--ca-border-strong)] pt-5">
                <div className="mb-2 font-serif text-4xl tracking-[0.04em] text-[var(--ca-navy)]">{step.n}</div>
                <h3 className="ca-card-title mb-2">{step.title}</h3>
                <p className="ca-copy text-[0.95rem]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ca-section border-y border-[var(--ca-border)]">
        <div className="ca-container ca-split">
          <div className="ca-media">
            <img src={customOrdersMainImage} alt="Large framed shell collection" loading="lazy" />
          </div>
          <div>
            <div className="ca-eyebrow mb-4">Most Requested</div>
            <h2 className="ca-section-title mb-5">What people commission</h2>
            <ul className="grid list-none gap-4 p-0 text-[var(--ca-muted)]">
              <li><strong className="font-serif text-[var(--ca-ink)]">Framed shell collections</strong> - sized to your wall, palette built to your room.</li>
              <li><strong className="font-serif text-[var(--ca-ink)]">Wedding &amp; hostess gifts</strong> - painted oysters, scallops, or small framed pieces.</li>
              <li><strong className="font-serif text-[var(--ca-ink)]">Tabletop sets</strong> - napkin rings, place cards, and small dishes for a dinner.</li>
              <li><strong className="font-serif text-[var(--ca-ink)]">New build accents</strong> - sets of pieces sourced and painted for a whole project.</li>
            </ul>
            <p className="ca-copy mt-5">Don't see what you have in mind? It probably still works. Send a note and we'll figure it out together.</p>
          </div>
        </div>
      </section>

      <section id="past-custom-pieces" className="ca-section scroll-mt-24">
        <div ref={galleryRef} className="ca-container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="ca-eyebrow mb-4">Previous Work</p>
            <h2 className="ca-section-title">Past Custom Pieces</h2>
          </div>

          {examplesError && (
            <p className="mt-4 text-center text-xs text-[var(--ca-muted)]">{examplesError}</p>
          )}

          {isLoadingExamples ? (
            <div className="ca-grid ca-grid-3 mt-10 items-start">
              {skeletonExamples.map((_, idx) => (
                <div key={`example-skeleton-${idx}`} className="space-y-3">
                  <div className="aspect-[4/5] bg-stone animate-pulse" />
                  <div className="h-4 bg-stone animate-pulse" />
                  <div className="h-3 bg-stone animate-pulse" />
                </div>
              ))}
            </div>
          ) : examples.length ? (
            <div className="ca-grid ca-grid-3 mt-10 items-start">
              {examples.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="ca-card w-full text-left"
                >
                  <div className="ca-card-media relative w-full flex-none">
                    <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="ca-card-body">
                    <h3 className="ca-card-title line-clamp-1 min-h-[1.75rem]">
                      {item.title}
                    </h3>
                    <p className="ca-copy text-sm leading-6 line-clamp-3">
                      {item.description}
                    </p>
                    <div className="mt-2 min-h-[34px] flex flex-wrap gap-2">
                      {item.tags?.length ? (
                        item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag}`}
                            className="border border-[var(--ca-border)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ca-muted)]"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="border border-[var(--ca-border)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] opacity-0" aria-hidden="true">
                          placeholder
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="ca-copy mt-8 text-center text-sm">Examples coming soon.</div>
          )}
        </div>
      </section>

      <section id="custom-order-request" className="ca-section scroll-mt-24 border-t border-[var(--ca-border)]" style={{ backgroundColor: contactBg }}>
        <div className="absolute inset-0" aria-hidden="true" />
        <div ref={formRef} className="ca-container relative">
          <div className="ca-split items-start">
            <div>
              <p className="ca-eyebrow mb-4">Custom Inquiry</p>
              <h2 className="ca-section-title mb-5">Start Your Custom Request</h2>
              <p className="ca-copy">
                Tell us what you have in mind and we'll follow up with next steps.
              </p>
              <p className="ca-copy mt-8">
                Typical timeline: <strong className="text-[var(--ca-ink)]">4-8 weeks</strong> from approved sketch to delivery, depending on scale and time of year.
              </p>
            </div>
            <div className="ca-form-skin">
              <ContactForm
                backgroundColor="transparent"
                variant="embedded"
                defaultInquiryType="custom_order"
                mode="custom-order"
              />
            </div>
          </div>
        </div>
      </section>

      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-white/95 shadow-2xl border border-[var(--ca-border)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center bg-white shadow-sm hover:bg-sand"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
            <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
              <div className="bg-white p-4 border border-[var(--ca-border)]">
                <div className="relative aspect-[4/5] sm:aspect-square">
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.title}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <h3 className="ca-card-title">{selectedItem.title}</h3>
                <p className="ca-copy mt-3 text-sm leading-6">{selectedItem.description}</p>
                {selectedItem.tags?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedItem.tags.map((tag) => (
                      <span
                        key={`${selectedItem.id}-modal-${tag}`}
                        className="border border-[var(--ca-border)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ca-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleRequestFromModal}
                  className="ca-button ca-button-filled mt-6"
                >
                  Start a request like this
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
