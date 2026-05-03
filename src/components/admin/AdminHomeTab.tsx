import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Category, CustomOrdersImage, HeroCollageImage, HomeFeaturedCategoryTile, HomeSiteContent } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { AdminSaveButton } from './AdminSaveButton';
import { adminFetchCategories, adminUploadImageUnified, getAdminSiteContentHome, updateAdminSiteContentHome } from '../../lib/adminApi';
import { ProgressiveImage } from '../ui/ProgressiveImage';

export function AdminHomeTab() {
  const [heroImages, setHeroImages] = useState<HeroCollageImage[]>([]);
  const [aboutImages, setAboutImages] = useState<CustomOrdersImage[]>([]);
  const [heroRotationEnabled, setHeroRotationEnabled] = useState(false);
  const [featuredTiles, setFeaturedTiles] = useState<HomeFeaturedCategoryTile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [homeContent, setHomeContent] = useState<HomeSiteContent>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHomeContent = async () => {
      setLoadState('loading');
      setError(null);
      try {
        const [content, categoryData] = await Promise.all([
          getAdminSiteContentHome(),
          adminFetchCategories().catch(() => []),
        ]);
        setHomeContent(content || {});
        const { hero, rotation, aboutImages } = normalizeSiteContent(content);
        setHeroImages(hero);
        setHeroRotationEnabled(rotation);
        setAboutImages(aboutImages);
        setFeaturedTiles(normalizeFeaturedTiles(content?.featuredCategoryTiles));
        setCategories(categoryData);
        setLoadState('idle');
      } catch (err) {
        console.error('Failed to load home content', err);
        setLoadState('error');
        setError(err instanceof Error ? err.message : 'Failed to load home content');
      }
    };
    loadHomeContent();
  }, []);

  const handleSave = async () => {
    setSaveState('saving');
    setError(null);
    try {
      const allImages: Array<{ imageUrl?: string; uploading?: boolean; uploadError?: string }> = [
        ...heroImages,
        ...aboutImages,
        ...featuredTiles.map((tile) => ({ imageUrl: tile.imageUrl || '' })),
      ];
      const hasUploads = allImages.some((img) => img?.uploading);
      const hasErrors = allImages.some((img) => img?.uploadError);
      const hasInvalid = allImages.some(
        (img) => img?.imageUrl?.startsWith('blob:') || img?.imageUrl?.startsWith('data:')
      );
      if (hasUploads) throw new Error('Images are still uploading.');
      if (hasErrors) throw new Error('Fix failed uploads before saving.');
      if (hasInvalid) throw new Error('Images must be uploaded first (no blob/data URLs).');
      const restHomeContent = { ...homeContent } as Record<string, unknown>;
      if ('customOrderImages' in restHomeContent) {
        delete restHomeContent.customOrderImages;
      }
      const payload: HomeSiteContent = {
        ...(restHomeContent as HomeSiteContent),
        ...buildSiteContent(heroImages, heroRotationEnabled, aboutImages),
        featuredCategoryTiles: buildFeaturedTiles(featuredTiles),
      };
      await updateAdminSiteContentHome(payload);
      setHomeContent(payload);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      console.error('Failed to save home content', err);
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Failed to save home content');
    }
  };

  return (
    <div className="space-y-12">
      <HeroCollageAdmin
        images={heroImages}
        onChange={setHeroImages}
        onSave={handleSave}
        saveState={saveState}
        heroRotationEnabled={heroRotationEnabled}
        onHeroRotationToggle={setHeroRotationEnabled}
      />

      <AboutImagesAdmin
        images={aboutImages}
        onChange={setAboutImages}
        onSave={handleSave}
        saveState={saveState}
      />

      <FeaturedCategoryTilesAdmin
        tiles={featuredTiles}
        categories={categories}
        onChange={setFeaturedTiles}
        onSave={handleSave}
        saveState={saveState}
      />

      {(loadState === 'loading' || error) && (
        <div className="rounded-shell border border-driftwood/60 bg-linen/70 px-3 py-2 text-sm text-charcoal/80">
          {loadState === 'loading' && 'Loading home content...'}
          {error && loadState !== 'loading' && error}
        </div>
      )}
    </div>
  );
}

interface HeroCollageAdminProps {
  images: HeroCollageImage[];
  onChange: React.Dispatch<React.SetStateAction<HeroCollageImage[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

function HeroCollageAdmin({
  images,
  onChange,
  onSave,
  saveState,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: HeroCollageAdminProps) {
  const slots = [0, 1, 2];

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    onChange((prev) => {
      const next = [...prev];
      const existing = next[index];
      next[index] = {
        id: existing?.id || `hero-${index}-${crypto.randomUUID?.() || Date.now()}`,
        imageUrl: previewUrl,
        alt: existing?.alt,
        createdAt: existing?.createdAt || new Date().toISOString(),
        uploading: true,
        optimizing: true,
        uploadError: undefined,
        previewUrl,
      };
      return next;
    });

    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'home',
        onStatus: (status) => {
          onChange((prev) => {
            const next = [...prev];
            const existing = next[index];
            if (existing) {
              next[index] = {
                ...existing,
                optimizing: status === 'optimizing',
                uploading: true,
              };
            }
            return next;
          });
        },
      });
      URL.revokeObjectURL(previewUrl);
      onChange((prev) => {
        const next = [...prev];
        const existing = next[index];
        if (existing) {
          next[index] = {
            ...existing,
            imageUrl: result.url,
            uploading: false,
            optimizing: false,
            uploadError: undefined,
            previewUrl: undefined,
          };
        } else {
          next[index] = { id: `hero-${index}`, imageUrl: result.url };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) => {
        const next = [...prev];
        const existing = next[index];
        if (existing) {
          next[index] = {
            ...existing,
            uploading: false,
            optimizing: false,
            uploadError: message,
          };
        }
        return next;
      });
    }
  };

  const handleAltChange = (index: number, alt: string) => {
    const existing = images[index];
    if (!existing) return;
    const next = [...images];
    next[index] = { ...existing, alt };
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange((prev) => {
      const next = [...prev];
      const existing = next[index];
      next[index] = existing ? { ...existing, imageUrl: '' } : { id: `hero-${index}`, imageUrl: '' };
      return next;
    });
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Home Page Images"
          subtitle="Upload the three hero rotation images shown at the top of the homepage."
        />
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-shell border border-driftwood/60 bg-linen/70 px-3 py-2">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] font-semibold text-deep-ocean">Rotate Hero Images</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-charcoal/70">
              ON: rotate through all hero images. OFF: show only the first image.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
            <input
              type="checkbox"
              className="ca-admin-toggle-checkbox"
              checked={!!heroRotationEnabled}
              onChange={(e) => onHeroRotationToggle?.(e.target.checked)}
            />
            <span>{heroRotationEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const image = images[slot];
          const inputId = `hero-collage-${slot}`;
          return (
            <div
              key={slot}
              className="lux-panel p-3 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">Hero Image {slot + 1}</div>
                <div className="flex items-center gap-2">
                  {image && (
                    <button type="button" onClick={() => handleRemove(slot)} className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    {image ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <>
                    <ProgressiveImage
                      src={image.previewUrl || image.imageUrl}
                      alt={image.alt || `Hero image ${slot + 1}`}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {image.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/80">
                        {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or Upload</span>
                  </div>
                )}
              </div>
              {image?.uploadError && (
                <div className="text-xs text-rose-700">{image.uploadError}</div>
              )}

              <div className="space-y-1">
                <label htmlFor={`${inputId}-alt`} className="lux-label text-[10px]">
                  Alt text / description
                </label>
                <input
                  id={`${inputId}-alt`}
                  type="text"
                  value={image?.alt || ''}
                  onChange={(e) => handleAltChange(slot, e.target.value)}
                  placeholder="Optional description"
                  className="lux-input text-sm"
                />
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface AboutImagesAdminProps {
  images: CustomOrdersImage[];
  onChange: React.Dispatch<React.SetStateAction<CustomOrdersImage[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
}

interface FeaturedCategoryTilesAdminProps {
  tiles: HomeFeaturedCategoryTile[];
  categories: Category[];
  onChange: React.Dispatch<React.SetStateAction<HomeFeaturedCategoryTile[]>>;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success' | 'error';
}

function FeaturedCategoryTilesAdmin({
  tiles,
  categories,
  onChange,
  onSave,
  saveState,
}: FeaturedCategoryTilesAdminProps) {
  const slots = [0, 1, 2, 3];

  const patchTile = (index: number, patch: Partial<HomeFeaturedCategoryTile>) => {
    onChange((prev) => {
      const next = normalizeFeaturedTiles(prev);
      next[index] = { ...(next[index] || {}), ...patch };
      return next.slice(0, 4);
    });
  };

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    patchTile(index, { imageUrl: previewUrl });
    try {
      const result = await adminUploadImageUnified(file, { scope: 'home' });
      URL.revokeObjectURL(previewUrl);
      patchTile(index, { imageUrl: result.url });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      console.error('Featured tile upload failed', err);
      patchTile(index, { imageUrl: '' });
    }
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Homepage Featured Categories"
          subtitle="Choose up to 4 category tiles to feature on the homepage. Each tile links customers into the shop."
        />
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => {
          const tile = tiles[slot] || {};
          const inputId = `featured-category-tile-${slot}`;
          return (
            <div key={slot} className="lux-panel p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
                  Featured Tile {slot + 1}
                </span>
                <button
                  type="button"
                  onClick={() => document.getElementById(inputId)?.click()}
                  className="lux-button--ghost px-3 py-1 text-[10px]"
                >
                  {tile.imageUrl ? 'Replace' : 'Upload'}
                </button>
              </div>
              <div className="aspect-[4/5] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {tile.imageUrl ? (
                  <ProgressiveImage
                    src={tile.imageUrl}
                    alt={tile.title || `Featured tile ${slot + 1}`}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Image</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor={`${inputId}-title`} className="lux-label text-[10px]">Title</label>
                <input
                  id={`${inputId}-title`}
                  type="text"
                  value={tile.title || ''}
                  onChange={(e) => patchTile(slot, { title: e.target.value })}
                  className="lux-input text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${inputId}-category`} className="lux-label text-[10px]">Link Category</label>
                <select
                  id={`${inputId}-category`}
                  value={tile.categorySlug || 'all'}
                  onChange={(e) => {
                    const slug = e.target.value;
                    const category = categories.find((item) => item.slug === slug);
                    patchTile(slot, {
                      categorySlug: slug,
                      categoryId: category?.id,
                    });
                  }}
                  className="lux-input text-sm"
                >
                  <option value="all">Shop All</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AboutImagesAdmin({ images, onChange, onSave, saveState }: AboutImagesAdminProps) {
  const slots = [
    {
      label: 'Home About Image',
      helper: 'Controls the image shown in the About section on the homepage.',
      index: 0,
    },
    {
      label: 'About Page Image 1',
      helper: 'Controls the first image shown on the standalone About page.',
      index: 1,
    },
    {
      label: 'About Page Image 2',
      helper: 'Controls the second image shown on the About page.',
      index: 2,
    },
  ];

  const handleFileSelect = async (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    onChange((prev) => {
      const next = [...prev];
      next[index] = {
        ...(next[index] || { imageUrl: '' }),
        imageUrl: previewUrl,
        uploading: true,
        optimizing: true,
        uploadError: undefined,
        previewUrl,
      };
      return next.slice(0, 3);
    });

    try {
      const result = await adminUploadImageUnified(file, {
        scope: 'home',
        onStatus: (status) => {
          onChange((prev) => {
            const updated = [...prev];
            const existing = updated[index];
            if (existing) {
              updated[index] = {
                ...existing,
                optimizing: status === 'optimizing',
                uploading: true,
              };
            }
            return updated.slice(0, 3);
          });
        },
      });
      URL.revokeObjectURL(previewUrl);
      onChange((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...(updated[index] || {}),
          imageUrl: result.url,
          uploading: false,
          optimizing: false,
          uploadError: undefined,
          previewUrl: undefined,
        };
        return updated.slice(0, 3);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      onChange((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...(updated[index] || {}),
          uploading: false,
          optimizing: false,
          uploadError: message,
        };
        return updated.slice(0, 3);
      });
    }
  };

  const handleRemove = (index: number) => {
    onChange((prev) => {
      const next = [...prev];
      next[index] = { ...(next[index] || { imageUrl: '' }), imageUrl: '' };
      return next.slice(0, 3);
    });
  };

  return (
    <section className="space-y-4 lux-card p-4">
      <div className="space-y-2">
        <AdminSectionHeader
          title="About Images"
          subtitle="Manage the homepage About image and both standalone About page images."
        />
        <div className="w-full sm:flex sm:justify-end">
          <AdminSaveButton saveState={saveState} onClick={onSave} className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const image = images[slot.index];
          const inputId = `about-image-${slot.index}`;
          return (
            <div
              key={slot.label}
              className="space-y-3 lux-panel p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot.index, file);
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">{slot.label.toUpperCase()}</span>
                  <p className="mt-1 text-xs leading-5 text-charcoal/60">{slot.helper}</p>
                </div>
                <div className="flex items-center gap-2">
                  {image?.imageUrl && (
                    <button type="button" onClick={() => handleRemove(slot.index)} className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    {image?.imageUrl ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[4/5] rounded-shell border border-dashed border-driftwood/70 bg-linen/70 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <>
                    <ProgressiveImage
                      src={image.previewUrl || image.imageUrl}
                      alt={slot.label}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {image.uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/80">
                        {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-charcoal/60 text-[11px] uppercase tracking-[0.2em] font-semibold">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or Upload</span>
                  </div>
                )}
              </div>
              {image?.uploadError && (
                <div className="text-xs text-rose-700">{image.uploadError}</div>
              )}

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot.index, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const normalizeSiteContent = (content: HomeSiteContent) => {
  const hero: HeroCollageImage[] = Array.from({ length: 3 }, (_, index) => ({
    id: `hero-${index}`,
    imageUrl: '',
  }));
  if (content.heroImages?.left) hero[0] = { id: 'hero-left', imageUrl: content.heroImages.left };
  if (content.heroImages?.middle) hero[1] = { id: 'hero-middle', imageUrl: content.heroImages.middle };
  if (content.heroImages?.right) hero[2] = { id: 'hero-right', imageUrl: content.heroImages.right };

  const aboutImages = Array.from({ length: 3 }, () => ({ imageUrl: '' }));
  if (content.aboutImages?.home) aboutImages[0] = { imageUrl: content.aboutImages.home };
  if (content.aboutImages?.about) aboutImages[1] = { imageUrl: content.aboutImages.about };
  if (content.aboutImages?.aboutPage2) aboutImages[2] = { imageUrl: content.aboutImages.aboutPage2 };

  return {
    hero,
    rotation: !!content.heroRotationEnabled,
    aboutImages,
  };
};

const normalizeFeaturedTiles = (tiles?: HomeFeaturedCategoryTile[]): HomeFeaturedCategoryTile[] => {
  const normalized = Array.from({ length: 4 }, (_, index) => ({
    ...(Array.isArray(tiles) ? tiles[index] : {}),
    categorySlug: (Array.isArray(tiles) ? tiles[index]?.categorySlug : '') || 'all',
  }));
  return normalized;
};

const buildFeaturedTiles = (tiles: HomeFeaturedCategoryTile[]): HomeFeaturedCategoryTile[] =>
  normalizeFeaturedTiles(tiles).map((tile) => ({
    imageUrl: tile.imageUrl || '',
    title: tile.title || '',
    categorySlug: tile.categorySlug || 'all',
    categoryId: tile.categoryId || undefined,
  }));

const buildSiteContent = (
  hero: HeroCollageImage[],
  heroRotationEnabled: boolean,
  aboutImages: CustomOrdersImage[]
): HomeSiteContent => {
  const heroImages = {
    left: hero[0]?.imageUrl || '',
    middle: hero[1]?.imageUrl || '',
    right: hero[2]?.imageUrl || '',
  };
  const aboutImageUrls = {
    home: aboutImages[0]?.imageUrl || '',
    about: aboutImages[1]?.imageUrl || '',
    aboutPage2: aboutImages[2]?.imageUrl || '',
  };
  return { heroImages, heroRotationEnabled, aboutImages: aboutImageUrls };
};


