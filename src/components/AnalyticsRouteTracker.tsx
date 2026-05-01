import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView } from '../lib/analytics';

export function AnalyticsRouteTracker() {
  const location = useLocation();
  const pagePath = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(pagePath);
  }, [pagePath]);

  return null;
}

