import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { ProductVideoSummary } from '../../lib/types';
import { ProgressiveImage } from '../ui/ProgressiveImage';

type ProductMediaItem =
  | {
      id: string;
      type: 'image';
      imageUrl: string;
      thumbnailUrl: string;
    }
  | {
      id: string;
      type: 'video';
      providerAssetId: string;
      thumbnailUrl: string | null;
    };

type ProductMediaGalleryProps = {
  loading: boolean;
  productName: string;
  imageUrls: string[];
  productVideo?: ProductVideoSummary;
};

const STREAM_IFRAME_BASE = 'https://iframe.videodelivery.net';

const buildStreamIframeUrl = (providerAssetId: string): string => {
  const uid = encodeURIComponent(providerAssetId);
  const url = new URL(`${STREAM_IFRAME_BASE}/${uid}`);
  url.searchParams.set('autoplay', 'false');
  url.searchParams.set('muted', 'false');
  return url.toString();
};

const isReadyProductVideo = (
  value: ProductVideoSummary | null | undefined
): value is ProductVideoSummary & { providerAssetId: string } =>
  !!value &&
  value.hasVideo === true &&
  value.status === 'ready' &&
  value.provider === 'cloudflare_stream' &&
  typeof value.providerAssetId === 'string' &&
  value.providerAssetId.trim().length > 0;

const buildMediaItems = (imageUrls: string[], productVideo?: ProductVideoSummary): ProductMediaItem[] => {
  const items: ProductMediaItem[] = [];

  imageUrls.forEach((url, index) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return;
    items.push({
      id: `image-${index}-${trimmed}`,
      type: 'image',
      imageUrl: trimmed,
      thumbnailUrl: trimmed,
    });
  });

  if (isReadyProductVideo(productVideo)) {
    items.push({
      id: `video-${productVideo.providerAssetId}`,
      type: 'video',
      providerAssetId: productVideo.providerAssetId,
      thumbnailUrl: productVideo.thumbnailUrl || null,
    });
  }

  return items;
};

export function ProductMediaGallery({
  loading,
  productName,
  imageUrls,
  productVideo,
}: ProductMediaGalleryProps) {
  const mediaItems = useMemo(() => buildMediaItems(imageUrls, productVideo), [imageUrls, productVideo]);
  const mediaIdsKey = useMemo(() => mediaItems.map((item) => item.id).join('|'), [mediaItems]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoMountNonce, setVideoMountNonce] = useState(0);
  const loadTimeoutRef = useRef<number | null>(null);

  const selectedItem = selectedIndex === null ? null : mediaItems[selectedIndex] || null;
  const isVideoSelected = selectedItem?.type === 'video';

  useEffect(() => {
    const firstImageIndex = mediaItems.findIndex((item) => item.type === 'image');
    setSelectedIndex(firstImageIndex >= 0 ? firstImageIndex : null);
    setVideoError(null);
    setVideoLoading(false);
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, [mediaIdsKey, mediaItems]);

  useEffect(() => {
    if (!isVideoSelected) {
      setVideoLoading(false);
      setVideoError(null);
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      return;
    }

    setVideoLoading(true);
    setVideoError(null);
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = window.setTimeout(() => {
      setVideoLoading(false);
      setVideoError('Video failed to load. Please try again.');
    }, 12000);

    return () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [isVideoSelected, selectedItem?.id, videoMountNonce]);

  const handlePrev = () => {
    if (mediaItems.length <= 1) return;
    if (selectedIndex === null) return;
    setSelectedIndex((prev) => {
      if (prev === null || prev === 0) return mediaItems.length - 1;
      return prev - 1;
    });
  };

  const handleNext = () => {
    if (mediaItems.length <= 1) return;
    if (selectedIndex === null) return;
    setSelectedIndex((prev) => {
      if (prev === null || prev === mediaItems.length - 1) return 0;
      return prev + 1;
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-square rounded-shell-lg overflow-hidden bg-white/70 border border-driftwood/60 lux-shadow">
        {loading ? (
          <div className="w-full h-full animate-pulse bg-sand" />
        ) : !selectedItem ? (
          <div className="w-full h-full flex items-center justify-center text-charcoal/50">Select media</div>
        ) : selectedItem.type === 'image' ? (
          <>
            <img
              src={selectedItem.imageUrl}
              alt={productName || 'Product'}
              className="w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              width={1200}
              height={1200}
            />
            {mediaItems.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                  aria-label="Next media"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="relative w-full h-full bg-black/90">
              {/* Stream player is mounted only when video is selected to avoid preload/autoplay side effects. */}
              {!videoError ? (
                <iframe
                  key={`${selectedItem.id}-${videoMountNonce}`}
                  src={buildStreamIframeUrl(selectedItem.providerAssetId)}
                  className="absolute inset-0 h-full w-full"
                  title={`${productName} video`}
                  allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
                  allowFullScreen
                  onLoad={() => {
                    setVideoLoading(false);
                    if (loadTimeoutRef.current) {
                      window.clearTimeout(loadTimeoutRef.current);
                      loadTimeoutRef.current = null;
                    }
                  }}
                  onError={() => {
                    setVideoLoading(false);
                    setVideoError('Video failed to load. Please try again.');
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90 p-4 text-center">
                  <p className="text-sm">{videoError}</p>
                  <button
                    type="button"
                    onClick={() => setVideoMountNonce((prev) => prev + 1)}
                    className="lux-button--ghost px-4 py-2 text-[10px]"
                  >
                    Retry Video
                  </button>
                </div>
              )}
              {videoLoading && !videoError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white/90 text-sm">
                  Loading video...
                </div>
              )}
            </div>
            {mediaItems.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                  aria-label="Previous media"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 lux-button--ghost px-3 py-2 rounded-full"
                  aria-label="Next media"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {mediaItems.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setSelectedIndex(idx)}
            className={`relative w-20 h-20 rounded-shell border ${
              idx === selectedIndex ? 'border-deep-ocean shadow-md' : 'border-driftwood/60'
            } overflow-hidden bg-white/80 transition`}
            aria-label={item.type === 'video' ? 'Select product video' : `Select image ${idx + 1}`}
          >
            {item.type === 'image' ? (
              <ProgressiveImage
                src={item.thumbnailUrl}
                alt={`${productName}-thumb-${idx}`}
                className="h-full w-full"
                imgClassName="w-full h-full object-cover"
                width={80}
                height={80}
                loading="lazy"
                decoding="async"
              />
            ) : item.thumbnailUrl ? (
              <>
                <ProgressiveImage
                  src={item.thumbnailUrl}
                  alt={`${productName}-video-thumb`}
                  className="h-full w-full"
                  imgClassName="w-full h-full object-cover"
                  width={80}
                  height={80}
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-deep-ocean">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                </div>
              </>
            ) : (
              <div className="h-full w-full bg-sand/80 text-charcoal/70 flex items-center justify-center">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-deep-ocean">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
