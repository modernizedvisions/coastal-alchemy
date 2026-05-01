import { Link, useLocation } from 'react-router-dom';
import { useSeo } from '../lib/seo';

export function NotFoundPage() {
  const location = useLocation();

  useSeo({
    title: 'Page Not Found | Coastal Alchemy',
    description: 'The requested page could not be found.',
    canonicalPath: location.pathname,
    noindex: true,
  });

  return (
    <section className="py-16 bg-linen min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
        <h1 className="text-3xl font-serif text-deep-ocean">Page not found</h1>
        <p className="text-charcoal/80">The page you requested does not exist.</p>
        <Link to="/" className="lux-button--ghost inline-flex">
          Back to Home
        </Link>
      </div>
    </section>
  );
}
