import { useEffect, useMemo, useState } from 'react';
import { AdminSectionHeader } from './AdminSectionHeader';
import {
  createAdminPromotion,
  deleteAdminPromotion,
  adminFetchCategories,
  adminFetchProducts,
  adminCreateProduct,
  adminUploadImageUnified,
  fetchAdminPromoCodes,
  fetchAdminPromotions,
  fetchAdminGiftPromotions,
  updateAdminPromotion,
  updateAdminPromoCode,
  updateAdminGiftPromotion,
  createAdminPromoCode,
  createAdminGiftPromotion,
  deleteAdminPromoCode,
  deleteAdminGiftPromotion,
} from '../../lib/adminApi';
import type { Category, GiftPromotion, Product, PromoCode, Promotion } from '../../lib/types';
import { formatEasternDateTime, toEasternDateTimeLocal, fromEasternDateTimeLocal } from '../../lib/dates';

type PromotionFormState = {
  name: string;
  percentOff: string;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  bannerEnabled: boolean;
  bannerText: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

type PromoCodeFormState = {
  code: string;
  percentOff: string;
  freeShipping: boolean;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

type GiftPromotionFormState = {
  name: string;
  thresholdSubtotalDollars: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  giftProductMode: 'existing' | 'new';
  giftProductId: string;
  bannerEnabled: boolean;
  bannerText: string;
  popupEnabled: boolean;
  popupTitle: string;
  popupDescription: string;
  popupButtonText: string;
  popupRedirect: string;
  popupImageId: string | null;
  popupImageUrl: string;
  newGiftName: string;
  newGiftDescription: string;
  newGiftImageId: string | null;
  newGiftImageUrl: string;
};

const emptyPromotionForm: PromotionFormState = {
  name: '',
  percentOff: '',
  scope: 'global',
  categorySlugs: [],
  bannerEnabled: false,
  bannerText: '',
  startsAt: '',
  endsAt: '',
  enabled: false,
};

const emptyPromoCodeForm: PromoCodeFormState = {
  code: '',
  percentOff: '',
  freeShipping: false,
  scope: 'global',
  categorySlugs: [],
  startsAt: '',
  endsAt: '',
  enabled: false,
};

const emptyGiftPromotionForm: GiftPromotionFormState = {
  name: '',
  thresholdSubtotalDollars: '',
  startsAt: '',
  endsAt: '',
  enabled: false,
  giftProductMode: 'existing',
  giftProductId: '',
  bannerEnabled: false,
  bannerText: '',
  popupEnabled: false,
  popupTitle: '',
  popupDescription: '',
  popupButtonText: '',
  popupRedirect: '',
  popupImageId: null,
  popupImageUrl: '',
  newGiftName: '',
  newGiftDescription: '',
  newGiftImageId: null,
  newGiftImageUrl: '',
};

const formatRange = (startsAt?: string | null, endsAt?: string | null) => {
  const start = startsAt ? formatEasternDateTime(startsAt) : 'Anytime';
  const end = endsAt ? formatEasternDateTime(endsAt) : 'Anytime';
  return `${start} - ${end}`;
};

const formatThresholdDollars = (cents: number | null | undefined) => {
  const safe = Number(cents || 0);
  if (!Number.isFinite(safe)) return '';
  return (safe / 100).toFixed(2);
};

const dollarsToCents = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
};

export function AdminPromotionsTab() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [giftPromotions, setGiftPromotions] = useState<GiftPromotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotionForm, setPromotionForm] = useState<PromotionFormState>(emptyPromotionForm);
  const [promoCodeForm, setPromoCodeForm] = useState<PromoCodeFormState>(emptyPromoCodeForm);
  const [giftPromotionForm, setGiftPromotionForm] = useState<GiftPromotionFormState>(emptyGiftPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [editingPromoCodeId, setEditingPromoCodeId] = useState<string | null>(null);
  const [editingGiftPromotionId, setEditingGiftPromotionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [popupImageUploading, setPopupImageUploading] = useState(false);
  const [giveawayImageUploading, setGiveawayImageUploading] = useState(false);

  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const productOptions = useMemo(
    () => [...products].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [products]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [promos, codes, gifts, cats, adminProducts] = await Promise.all([
          fetchAdminPromotions(),
          fetchAdminPromoCodes(),
          fetchAdminGiftPromotions(),
          adminFetchCategories(),
          adminFetchProducts(),
        ]);
        setPromotions(promos);
        setPromoCodes(codes);
        setGiftPromotions(gifts);
        setCategories(cats);
        setProducts(adminProducts);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load promotions data.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePromotionFormChange = (
    field: keyof PromotionFormState,
    value: string | boolean | string[]
  ) => {
    setPromotionForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePromoCodeFormChange = (
    field: keyof PromoCodeFormState,
    value: string | boolean | string[]
  ) => {
    setPromoCodeForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGiftPromotionFormChange = (
    field: keyof GiftPromotionFormState,
    value: string | boolean | string[] | null
  ) => {
    setGiftPromotionForm((prev) => ({ ...prev, [field]: value as never }));
  };

  const resetPromotionForm = () => {
    setPromotionForm(emptyPromotionForm);
    setEditingPromotionId(null);
  };

  const resetPromoCodeForm = () => {
    setPromoCodeForm(emptyPromoCodeForm);
    setEditingPromoCodeId(null);
  };

  const resetGiftPromotionForm = () => {
    setGiftPromotionForm(emptyGiftPromotionForm);
    setEditingGiftPromotionId(null);
  };

  const startEditPromotion = (promo: Promotion) => {
    setPromotionForm({
      name: promo.name,
      percentOff: promo.percentOff ? String(promo.percentOff) : '',
      scope: promo.scope,
      categorySlugs: promo.categorySlugs || [],
      bannerEnabled: promo.bannerEnabled,
      bannerText: promo.bannerText || '',
      startsAt: toEasternDateTimeLocal(promo.startsAt),
      endsAt: toEasternDateTimeLocal(promo.endsAt),
      enabled: promo.enabled,
    });
    setEditingPromotionId(promo.id);
  };

  const startEditPromoCode = (code: PromoCode) => {
    setPromoCodeForm({
      code: code.code,
      percentOff: code.percentOff ? String(code.percentOff) : '',
      freeShipping: code.freeShipping,
      scope: code.scope,
      categorySlugs: code.categorySlugs || [],
      startsAt: toEasternDateTimeLocal(code.startsAt),
      endsAt: toEasternDateTimeLocal(code.endsAt),
      enabled: code.enabled,
    });
    setEditingPromoCodeId(code.id);
  };

  const startEditGiftPromotion = (promotion: GiftPromotion) => {
    setGiftPromotionForm({
      name: promotion.name || '',
      thresholdSubtotalDollars: formatThresholdDollars(promotion.thresholdSubtotalCents),
      startsAt: toEasternDateTimeLocal(promotion.startsAt),
      endsAt: toEasternDateTimeLocal(promotion.endsAt),
      enabled: promotion.enabled === true,
      giftProductMode: 'existing',
      giftProductId: promotion.giftProductId || '',
      bannerEnabled: promotion.bannerEnabled === true,
      bannerText: promotion.bannerText || '',
      popupEnabled: promotion.popupEnabled === true,
      popupTitle: promotion.popupTitle || '',
      popupDescription: promotion.popupDescription || '',
      popupButtonText: promotion.popupButtonText || '',
      popupRedirect: promotion.popupRedirect || '',
      popupImageId: promotion.popupImageId || null,
      popupImageUrl: promotion.popupImageUrl || '',
      newGiftName: '',
      newGiftDescription: '',
      newGiftImageId: null,
      newGiftImageUrl: '',
    });
    setEditingGiftPromotionId(promotion.id);
  };

  const submitPromotion = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: promotionForm.name.trim(),
        percentOff: Number(promotionForm.percentOff),
        scope: promotionForm.scope,
        categorySlugs: promotionForm.scope === 'categories' ? promotionForm.categorySlugs : [],
        bannerEnabled: promotionForm.bannerEnabled,
        bannerText: promotionForm.bannerText.trim(),
        startsAt: fromEasternDateTimeLocal(promotionForm.startsAt),
        endsAt: fromEasternDateTimeLocal(promotionForm.endsAt),
        enabled: promotionForm.enabled,
      };

      if (editingPromotionId) {
        const updated = await updateAdminPromotion(editingPromotionId, payload);
        setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createAdminPromotion(payload);
        setPromotions((prev) => [created, ...prev]);
      }
      resetPromotionForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promotion.');
    } finally {
      setSaving(false);
    }
  };

  const submitPromoCode = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: promoCodeForm.code.trim(),
        percentOff: promoCodeForm.percentOff ? Number(promoCodeForm.percentOff) : null,
        freeShipping: promoCodeForm.freeShipping,
        scope: promoCodeForm.scope,
        categorySlugs: promoCodeForm.scope === 'categories' ? promoCodeForm.categorySlugs : [],
        startsAt: fromEasternDateTimeLocal(promoCodeForm.startsAt),
        endsAt: fromEasternDateTimeLocal(promoCodeForm.endsAt),
        enabled: promoCodeForm.enabled,
      };

      if (editingPromoCodeId) {
        const updated = await updateAdminPromoCode(editingPromoCodeId, payload);
        setPromoCodes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createAdminPromoCode(payload);
        setPromoCodes((prev) => [created, ...prev]);
      }
      resetPromoCodeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promo code.');
    } finally {
      setSaving(false);
    }
  };

  const reloadGiftPromotions = async () => {
    const next = await fetchAdminGiftPromotions();
    setGiftPromotions(next);
  };

  const reloadProducts = async () => {
    const next = await adminFetchProducts();
    setProducts(next);
  };

  const handlePopupImageUpload = async (file: File) => {
    setPopupImageUploading(true);
    setError(null);
    try {
      const uploaded = await adminUploadImageUnified(file, { scope: 'home' });
      setGiftPromotionForm((prev) => ({
        ...prev,
        popupImageId: uploaded.imageId || uploaded.id,
        popupImageUrl: uploaded.url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload popup image.');
    } finally {
      setPopupImageUploading(false);
    }
  };

  const handleGiveawayImageUpload = async (file: File) => {
    setGiveawayImageUploading(true);
    setError(null);
    try {
      const uploaded = await adminUploadImageUnified(file, { scope: 'products' });
      setGiftPromotionForm((prev) => ({
        ...prev,
        newGiftImageId: uploaded.imageId || uploaded.id,
        newGiftImageUrl: uploaded.url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload giveaway product image.');
    } finally {
      setGiveawayImageUploading(false);
    }
  };

  const saveNewGiveawayProduct = async () => {
    const name = giftPromotionForm.newGiftName.trim();
    const description = giftPromotionForm.newGiftDescription.trim();
    const imageUrl = giftPromotionForm.newGiftImageUrl.trim();
    if (!name) {
      setError('Giveaway item name is required.');
      return;
    }
    if (!description) {
      setError('Giveaway item description is required.');
      return;
    }
    if (!imageUrl) {
      setError('Upload a giveaway product image before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await adminCreateProduct({
        name,
        description,
        priceCents: 0,
        category: 'Giveaway',
        imageUrl,
        imageUrls: [],
        primaryImageId: giftPromotionForm.newGiftImageId || undefined,
        imageIds: [],
        quantityAvailable: 9999,
        isOneOff: false,
        isActive: false,
        collection: 'Giveaway',
      });

      if (!created?.id) {
        throw new Error('Giveaway product creation returned no product.');
      }

      await reloadProducts();
      setGiftPromotionForm((prev) => ({
        ...prev,
        giftProductMode: 'existing',
        giftProductId: created.id,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create giveaway product.');
    } finally {
      setSaving(false);
    }
  };

  const submitGiftPromotion = async () => {
    const thresholdSubtotalCents = dollarsToCents(giftPromotionForm.thresholdSubtotalDollars);
    const giftProductId = giftPromotionForm.giftProductId.trim();

    if (!giftPromotionForm.name.trim()) {
      setError('Gift promotion name is required.');
      return;
    }
    if (thresholdSubtotalCents < 1) {
      setError('Minimum cart amount must be at least $0.01.');
      return;
    }
    if (!giftProductId) {
      setError('Select a giveaway product.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: giftPromotionForm.name.trim(),
        enabled: giftPromotionForm.enabled,
        startsAt: fromEasternDateTimeLocal(giftPromotionForm.startsAt),
        endsAt: fromEasternDateTimeLocal(giftPromotionForm.endsAt),
        thresholdSubtotalCents,
        giftProductId,
        giftQuantity: 1,
        bannerEnabled: giftPromotionForm.bannerEnabled,
        bannerText: giftPromotionForm.bannerText.trim(),
        popupEnabled: giftPromotionForm.popupEnabled,
        popupTitle: giftPromotionForm.popupTitle.trim(),
        popupDescription: giftPromotionForm.popupDescription.trim(),
        popupButtonText: giftPromotionForm.popupButtonText.trim(),
        popupRedirect: giftPromotionForm.popupRedirect.trim(),
        popupImageId: giftPromotionForm.popupImageId,
      };

      if (editingGiftPromotionId) {
        await updateAdminGiftPromotion(editingGiftPromotionId, payload);
      } else {
        await createAdminGiftPromotion(payload);
      }
      await reloadGiftPromotions();
      resetGiftPromotionForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save gift promotion.');
    } finally {
      setSaving(false);
    }
  };

  const togglePromotionEnabled = async (promo: Promotion) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdminPromotion(promo.id, { enabled: !promo.enabled });
      setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promotion.');
    } finally {
      setSaving(false);
    }
  };

  const togglePromoCodeEnabled = async (code: PromoCode) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdminPromoCode(code.id, { enabled: !code.enabled });
      setPromoCodes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promo code.');
    } finally {
      setSaving(false);
    }
  };

  const toggleGiftPromotionEnabled = async (promotion: GiftPromotion) => {
    setSaving(true);
    setError(null);
    try {
      await updateAdminGiftPromotion(promotion.id, { enabled: !promotion.enabled });
      await reloadGiftPromotions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update gift promotion.');
    } finally {
      setSaving(false);
    }
  };

  const removePromotion = async (promo: Promotion) => {
    setSaving(true);
    setError(null);
    try {
      await deleteAdminPromotion(promo.id);
      setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
      if (editingPromotionId === promo.id) resetPromotionForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promotion.');
    } finally {
      setSaving(false);
    }
  };

  const removePromoCode = async (code: PromoCode) => {
    setSaving(true);
    setError(null);
    try {
      await deleteAdminPromoCode(code.id);
      setPromoCodes((prev) => prev.filter((c) => c.id !== code.id));
      if (editingPromoCodeId === code.id) resetPromoCodeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promo code.');
    } finally {
      setSaving(false);
    }
  };

  const removeGiftPromotion = async (promotion: GiftPromotion) => {
    setSaving(true);
    setError(null);
    try {
      await deleteAdminGiftPromotion(promotion.id);
      await reloadGiftPromotions();
      if (editingGiftPromotionId === promotion.id) {
        resetGiftPromotionForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete gift promotion.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-charcoal/70">Loading promotions...</div>;
  }

  return (
    <div className="lux-card overflow-hidden">
      <div className="px-6 pt-6">
        <AdminSectionHeader title="Promotions" subtitle="Manage promotions and promo codes." />
      </div>
      <div className="px-6 pb-10 space-y-12">
        {error && (
          <div className="rounded-shell border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="space-y-6">
          <div>
            <h3 className="lux-heading text-lg">Promotions</h3>
            <p className="text-sm text-charcoal/70">
              Only one promotion can be enabled at a time.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lux-panel p-4 space-y-4">
              <div className="text-sm font-semibold text-charcoal">
                {editingPromotionId ? 'Edit Promotion' : 'Create Promotion'}
              </div>
              <div className="space-y-3">
                <label className="block lux-label text-[10px]">Name</label>
                <input
                  type="text"
                  value={promotionForm.name}
                  onChange={(e) => handlePromotionFormChange('name', e.target.value)}
                  placeholder="Summer Sale"
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Percent off</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={promotionForm.percentOff}
                  onChange={(e) => handlePromotionFormChange('percentOff', e.target.value)}
                  placeholder="10%"
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Scope</label>
                <select
                  value={promotionForm.scope}
                  onChange={(e) => handlePromotionFormChange('scope', e.target.value)}
                  className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                >
                  <option value="global">GLOBAL</option>
                  <option value="categories">CATEGORIES</option>
                </select>
                {promotionForm.scope === 'categories' && (
                  <div className="space-y-2">
                    <div className="lux-label text-[10px]">Categories</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {categoryOptions.map((category) => {
                        const checked = promotionForm.categorySlugs.includes(category.slug);
                        return (
                          <label key={category.slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...promotionForm.categorySlugs, category.slug]
                                  : promotionForm.categorySlugs.filter((slug) => slug !== category.slug);
                                handlePromotionFormChange('categorySlugs', next);
                              }}
                              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                            />
                            <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
                              {category.name?.toUpperCase() || 'CATEGORY'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={promotionForm.bannerEnabled}
                    onChange={(e) => handlePromotionFormChange('bannerEnabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80">Show banner</span>
                </div>
                {promotionForm.bannerEnabled && (
                  <input
                    type="text"
                    value={promotionForm.bannerText}
                    onChange={(e) => handlePromotionFormChange('bannerText', e.target.value)}
                    placeholder="Banner text"
                    className="lux-input text-sm"
                  />
                )}
                <label className="block lux-label text-[10px]">Starts at</label>
                <input
                  type="datetime-local"
                  value={promotionForm.startsAt}
                  onChange={(e) => handlePromotionFormChange('startsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Ends at</label>
                <input
                  type="datetime-local"
                  value={promotionForm.endsAt}
                  onChange={(e) => handlePromotionFormChange('endsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promotionForm.enabled}
                    onChange={(e) => handlePromotionFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitPromotion}
                  disabled={saving}
                  className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                >
                  {editingPromotionId ? 'Update' : 'Create'}
                </button>
                {editingPromotionId && (
                  <button
                    type="button"
                    onClick={resetPromotionForm}
                    className="lux-button--ghost px-4 py-2 text-[10px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {promotions.length === 0 ? (
                <div className="lux-panel p-4 text-sm text-charcoal/70">
                  No promotions yet.
                </div>
              ) : (
                promotions.map((promo) => (
                  <div key={promo.id} className="lux-panel p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-charcoal">{promo.name}</div>
                        <div className="text-xs text-charcoal/60">{promo.percentOff}% off</div>
                      </div>
                      <span className={`text-xs font-semibold ${promo.enabled ? 'text-emerald-600' : 'text-charcoal/60'}`}>
                        {promo.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal/70">
                      Scope: {promo.scope === 'global' ? 'Global' : `Categories (${promo.categorySlugs.length})`}
                    </div>
                    <div className="text-xs text-charcoal/70">Schedule: {formatRange(promo.startsAt, promo.endsAt)}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => togglePromotionEnabled(promo)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        {promo.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPromotion(promo)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removePromotion(promo)}
                        className="lux-button--outline px-3 py-1 text-[10px] !border-rose-200 !text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="lux-heading text-lg">Promo Codes</h3>
            <p className="text-sm text-charcoal/70">Create percentage and free-shipping codes.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lux-panel p-4 space-y-4">
              <div className="text-sm font-semibold text-charcoal">
                {editingPromoCodeId ? 'Edit Promo Code' : 'Create Promo Code'}
              </div>
              <div className="space-y-3">
                <label className="block lux-label text-[10px]">Code</label>
                <input
                  type="text"
                  value={promoCodeForm.code}
                  onChange={(e) => handlePromoCodeFormChange('code', e.target.value.toUpperCase())}
                  className="lux-input text-sm uppercase tracking-[0.2em]"
                />
                <label className="block lux-label text-[10px]">Percent off</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={promoCodeForm.percentOff}
                  onChange={(e) => handlePromoCodeFormChange('percentOff', e.target.value)}
                  placeholder="10%"
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promoCodeForm.freeShipping}
                    onChange={(e) => handlePromoCodeFormChange('freeShipping', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Free shipping
                </label>
                <label className="block lux-label text-[10px]">Scope</label>
                <select
                  value={promoCodeForm.scope}
                  onChange={(e) => handlePromoCodeFormChange('scope', e.target.value)}
                  className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                >
                  <option value="global">GLOBAL</option>
                  <option value="categories">CATEGORIES</option>
                </select>
                {promoCodeForm.scope === 'categories' && (
                  <div className="space-y-2">
                    <div className="lux-label text-[10px]">Categories</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {categoryOptions.map((category) => {
                        const checked = promoCodeForm.categorySlugs.includes(category.slug);
                        return (
                          <label key={category.slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...promoCodeForm.categorySlugs, category.slug]
                                  : promoCodeForm.categorySlugs.filter((slug) => slug !== category.slug);
                                handlePromoCodeFormChange('categorySlugs', next);
                              }}
                              className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                            />
                            <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">
                              {category.name?.toUpperCase() || 'CATEGORY'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="block lux-label text-[10px]">Starts at</label>
                <input
                  type="datetime-local"
                  value={promoCodeForm.startsAt}
                  onChange={(e) => handlePromoCodeFormChange('startsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Ends at</label>
                <input
                  type="datetime-local"
                  value={promoCodeForm.endsAt}
                  onChange={(e) => handlePromoCodeFormChange('endsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={promoCodeForm.enabled}
                    onChange={(e) => handlePromoCodeFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitPromoCode}
                  disabled={saving}
                  className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                >
                  {editingPromoCodeId ? 'Update' : 'Create'}
                </button>
                {editingPromoCodeId && (
                  <button
                    type="button"
                    onClick={resetPromoCodeForm}
                    className="lux-button--ghost px-4 py-2 text-[10px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {promoCodes.length === 0 ? (
                <div className="lux-panel p-4 text-sm text-charcoal/70">
                  No promo codes yet.
                </div>
              ) : (
                promoCodes.map((code) => (
                  <div key={code.id} className="lux-panel p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-charcoal">{code.code.toUpperCase()}</div>
                        <div className="text-xs text-charcoal/60">
                          {code.percentOff ? `${code.percentOff}% off` : 'No percent'} •{' '}
                          {code.freeShipping ? 'Free shipping' : 'Paid shipping'}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold ${code.enabled ? 'text-emerald-600' : 'text-charcoal/60'}`}>
                        {code.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal/70">
                      Scope: {code.scope === 'global' ? 'Global' : `Categories (${code.categorySlugs.length})`}
                    </div>
                    <div className="text-xs text-charcoal/70">Schedule: {formatRange(code.startsAt, code.endsAt)}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => togglePromoCodeEnabled(code)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        {code.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPromoCode(code)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removePromoCode(code)}
                        className="lux-button--outline px-3 py-1 text-[10px] !border-rose-200 !text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h3 className="lux-heading text-lg">Gift Promotions</h3>
            <p className="text-sm text-charcoal/70">
              Build repeatable “Spend X, get free Y product” offers. Only one gift promotion can be active at a time.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lux-panel p-4 space-y-5">
              <div className="text-sm font-semibold text-charcoal">
                {editingGiftPromotionId ? 'Edit Gift Promotion' : 'Create Gift Promotion'}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/70">Promotion Basics</h4>
                <label className="block lux-label text-[10px]">Promotion Name</label>
                <input
                  type="text"
                  value={giftPromotionForm.name}
                  onChange={(e) => handleGiftPromotionFormChange('name', e.target.value)}
                  placeholder="Free Shell Ornament Offer"
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Minimum Cart Amount ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={giftPromotionForm.thresholdSubtotalDollars}
                  onChange={(e) => handleGiftPromotionFormChange('thresholdSubtotalDollars', e.target.value)}
                  placeholder="75.00"
                  className="lux-input text-sm"
                />
                <p className="text-xs text-charcoal/60">Qualification uses merchandise subtotal before shipping and tax.</p>
                <label className="block lux-label text-[10px]">Starts At</label>
                <input
                  type="datetime-local"
                  value={giftPromotionForm.startsAt}
                  onChange={(e) => handleGiftPromotionFormChange('startsAt', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Ends At</label>
                <input
                  type="datetime-local"
                  value={giftPromotionForm.endsAt}
                  onChange={(e) => handleGiftPromotionFormChange('endsAt', e.target.value)}
                  className="lux-input text-sm"
                />
              </div>

              <div className="space-y-3 border-t border-driftwood/50 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/70">Giveaway Product</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-charcoal/80">
                    <input
                      type="radio"
                      name="gift-product-mode"
                      checked={giftPromotionForm.giftProductMode === 'existing'}
                      onChange={() => handleGiftPromotionFormChange('giftProductMode', 'existing')}
                      className="h-4 w-4 border-driftwood/70 text-deep-ocean"
                    />
                    Use Existing Product
                  </label>
                  <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-charcoal/80">
                    <input
                      type="radio"
                      name="gift-product-mode"
                      checked={giftPromotionForm.giftProductMode === 'new'}
                      onChange={() => {
                        setGiftPromotionForm((prev) => ({
                          ...prev,
                          giftProductMode: 'new',
                          newGiftName: prev.newGiftName || prev.name || '',
                        }));
                      }}
                      className="h-4 w-4 border-driftwood/70 text-deep-ocean"
                    />
                    Create New Giveaway Product
                  </label>
                </div>

                {giftPromotionForm.giftProductMode === 'existing' ? (
                  <div className="space-y-2">
                    <label className="block lux-label text-[10px]">Select Giveaway Product</label>
                    <select
                      value={giftPromotionForm.giftProductId}
                      onChange={(e) => handleGiftPromotionFormChange('giftProductId', e.target.value)}
                      className="lux-input text-sm"
                    >
                      <option value="">Select a product...</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.category || product.type || 'General'}) {product.visible ? '' : '- Inactive'}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-charcoal/60">Inactive products can still be selected for giveaways.</p>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-shell border border-driftwood/60 bg-white/70 p-3">
                    <label className="block lux-label text-[10px]">Giveaway Item Name</label>
                    <input
                      type="text"
                      value={giftPromotionForm.newGiftName}
                      onChange={(e) => handleGiftPromotionFormChange('newGiftName', e.target.value)}
                      className="lux-input text-sm"
                    />
                    <label className="block lux-label text-[10px]">Description</label>
                    <textarea
                      value={giftPromotionForm.newGiftDescription}
                      onChange={(e) => handleGiftPromotionFormChange('newGiftDescription', e.target.value)}
                      rows={3}
                      className="lux-input text-sm min-h-[90px]"
                    />
                    <label className="block lux-label text-[10px]">Upload Product Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleGiveawayImageUpload(file);
                      }}
                      className="block w-full text-xs text-charcoal/80"
                    />
                    {giveawayImageUploading && (
                      <p className="text-xs text-charcoal/60">Uploading giveaway image...</p>
                    )}
                    {giftPromotionForm.newGiftImageUrl ? (
                      <img
                        src={giftPromotionForm.newGiftImageUrl}
                        alt="Giveaway preview"
                        className="h-24 w-24 rounded-shell border border-driftwood/60 object-cover bg-sand/60"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={saveNewGiveawayProduct}
                      disabled={saving || giveawayImageUploading}
                      className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                    >
                      Save Giveaway Product
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-driftwood/50 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/70">Banner</h4>
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={giftPromotionForm.bannerEnabled}
                    onChange={(e) => handleGiftPromotionFormChange('bannerEnabled', e.target.checked)}
                    className="h-4 w-4 border-driftwood/70 text-deep-ocean"
                  />
                  Show Banner
                </label>
                {giftPromotionForm.bannerEnabled && (
                  <>
                    <label className="block lux-label text-[10px]">Banner Text</label>
                    <input
                      type="text"
                      value={giftPromotionForm.bannerText}
                      onChange={(e) => handleGiftPromotionFormChange('bannerText', e.target.value)}
                      className="lux-input text-sm"
                    />
                  </>
                )}
              </div>

              <div className="space-y-3 border-t border-driftwood/50 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/70">Homepage Popup</h4>
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={giftPromotionForm.popupEnabled}
                    onChange={(e) => handleGiftPromotionFormChange('popupEnabled', e.target.checked)}
                    className="h-4 w-4 border-driftwood/70 text-deep-ocean"
                  />
                  Show Homepage Popup
                </label>
                <label className="block lux-label text-[10px]">Popup Title</label>
                <input
                  type="text"
                  value={giftPromotionForm.popupTitle}
                  onChange={(e) => handleGiftPromotionFormChange('popupTitle', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Popup Description</label>
                <textarea
                  value={giftPromotionForm.popupDescription}
                  onChange={(e) => handleGiftPromotionFormChange('popupDescription', e.target.value)}
                  rows={3}
                  className="lux-input text-sm min-h-[90px]"
                />
                <label className="block lux-label text-[10px]">Button Text</label>
                <input
                  type="text"
                  value={giftPromotionForm.popupButtonText}
                  onChange={(e) => handleGiftPromotionFormChange('popupButtonText', e.target.value)}
                  className="lux-input text-sm"
                />
                <label className="block lux-label text-[10px]">Page Redirect</label>
                <input
                  type="text"
                  value={giftPromotionForm.popupRedirect}
                  onChange={(e) => handleGiftPromotionFormChange('popupRedirect', e.target.value)}
                  className="lux-input text-sm"
                  placeholder="/shop"
                />
                <label className="block lux-label text-[10px]">Popup Image</label>
                <p className="text-xs text-charcoal/60">
                  Upload a dedicated marketing image. This is separate from the giveaway product image.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePopupImageUpload(file);
                  }}
                  className="block w-full text-xs text-charcoal/80"
                />
                {popupImageUploading && <p className="text-xs text-charcoal/60">Uploading popup image...</p>}
                {giftPromotionForm.popupImageUrl ? (
                  <img
                    src={giftPromotionForm.popupImageUrl}
                    alt="Popup preview"
                    className="h-24 w-24 rounded-shell border border-driftwood/60 object-cover bg-sand/60"
                  />
                ) : null}
              </div>

              <div className="space-y-3 border-t border-driftwood/50 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-charcoal/70">Publish</h4>
                <label className="flex items-center gap-2 text-sm text-charcoal/80">
                  <input
                    type="checkbox"
                    checked={giftPromotionForm.enabled}
                    onChange={(e) => handleGiftPromotionFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                  />
                  Make This Gift Promotion Active
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitGiftPromotion}
                    disabled={saving || popupImageUploading || giveawayImageUploading}
                    className="lux-button px-4 py-2 text-[10px] disabled:opacity-50"
                  >
                    {editingGiftPromotionId ? 'Update Gift Promotion' : 'Save Gift Promotion'}
                  </button>
                  {editingGiftPromotionId && (
                    <button
                      type="button"
                      onClick={resetGiftPromotionForm}
                      className="lux-button--ghost px-4 py-2 text-[10px]"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {giftPromotions.length === 0 ? (
                <div className="lux-panel p-4 text-sm text-charcoal/70">
                  No gift promotions yet.
                </div>
              ) : (
                giftPromotions.map((giftPromotion) => (
                  <div key={giftPromotion.id} className="lux-panel p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-charcoal">{giftPromotion.name}</div>
                        <div className="text-xs text-charcoal/60">
                          Spend ${formatThresholdDollars(giftPromotion.thresholdSubtotalCents)} get free{' '}
                          {giftPromotion.giftProduct?.name || 'gift item'}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold ${giftPromotion.enabled ? 'text-emerald-600' : 'text-charcoal/60'}`}>
                        {giftPromotion.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-charcoal/70">Schedule: {formatRange(giftPromotion.startsAt, giftPromotion.endsAt)}</div>
                    <div className="text-xs text-charcoal/70">
                      Banner: {giftPromotion.bannerEnabled ? 'On' : 'Off'} | Popup: {giftPromotion.popupEnabled ? 'On' : 'Off'}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => toggleGiftPromotionEnabled(giftPromotion)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        {giftPromotion.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditGiftPromotion(giftPromotion)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGiftPromotion(giftPromotion)}
                        className="lux-button--outline px-3 py-1 text-[10px] !border-rose-200 !text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

