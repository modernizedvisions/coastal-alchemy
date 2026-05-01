import { Link } from 'react-router-dom';
import { ContactForm } from '../components/ContactForm';

export function ContactPage() {
  return (
    <div className="ca-page">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">Contact</div>
        <h1>Reach out.</h1>
        <p className="ca-copy mx-auto mt-4 max-w-2xl">
          For commissions, press, design trade, or just to talk shells - I read every note and reply within a few days.
        </p>
      </header>

      <section className="ca-section">
        <div className="ca-container ca-split items-start">
          <div>
            <div className="ca-eyebrow mb-4">The Studio</div>
            <h2 className="ca-section-title mb-5">Naples, Florida.</h2>
            <p className="ca-copy">
              The studio is by appointment only. Most projects start with an email - if it's a custom piece, head to the{' '}
              <Link to="/custom-orders" className="border-b border-[var(--ca-navy)] text-[var(--ca-ink)]">
                custom orders
              </Link>{' '}
              page for a more detailed form.
            </p>
            <p className="ca-copy mt-8 leading-8">
              <strong className="block font-serif text-xl font-normal tracking-[0.06em] text-[var(--ca-ink)]">
                Coastal Alchemy
              </strong>
              Naples, Florida
              <br />
              hello@coastalalchemy.com
              <br />
              <span className="text-sm">By appointment only</span>
            </p>

            <div className="mt-12 border-t border-[var(--ca-border-strong)] pt-8">
              <div className="ca-eyebrow mb-3">Designers &amp; Trade</div>
              <p className="ca-copy">
                Working on a project in Naples, Marco Island, or 30A? I work with a small number of trade clients each year. Mention your firm in the note and I'll be in touch.
              </p>
            </div>
          </div>
          <div className="ca-form-skin">
            <ContactForm backgroundColor="transparent" variant="embedded" />
          </div>
        </div>
      </section>
    </div>
  );
}
