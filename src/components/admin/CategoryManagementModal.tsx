import { type RefObject, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  adminCreateCategory,
  adminCreateVariationPreset,
  adminDeleteCategory,
  adminDeleteVariationPreset,
  adminFetchCategories,
  adminFetchVariationPresets,
  adminUpdateCategory,
} from '../../lib/adminApi';
import type { Category, VariationGroup, VariationPreset } from '../../lib/types';
import { createVariationGroup, createVariationOption, normalizeVariationGroups } from '../../lib/categoryOptions';

interface CategoryManagementModalProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoriesChange: (categories: Category[]) => void;
  onCategorySelected?: (name: string) => void;
}

type CategoryDraft = {
  name: string;
  subtitle: string;
  shipping: string;
  optionGroups: VariationGroup[];
};

const emptyDraft = (): CategoryDraft => ({
  name: '',
  subtitle: '',
  shipping: '',
  optionGroups: [],
});

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();
  const ordered: Category[] = [];
  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key || map.has(key)) return;
    const normalized: Category = { ...cat, id: cat.id || key };
    map.set(key, normalized);
    ordered.push(normalized);
  });
  return ordered;
};

const cloneGroups = (groups: VariationGroup[]): VariationGroup[] =>
  normalizeVariationGroups(groups).map((group, groupIndex) => ({
    ...group,
    id: crypto.randomUUID(),
    presetId: null,
    displayOrder: groupIndex,
    options: group.options.map((option, optionIndex) => ({
      ...option,
      id: crypto.randomUUID(),
      displayOrder: optionIndex,
    })),
  }));

const categoryGroups = (cat: Category) =>
  normalizeVariationGroups(
    cat.optionGroups?.length
      ? cat.optionGroups
      : cat.optionGroupLabel && cat.optionGroupOptions?.length
      ? [createVariationGroup(cat.optionGroupLabel, cat.optionGroupOptions)]
      : []
  );

export function CategoryManagementModal({
  open,
  onClose,
  categories,
  onCategoriesChange,
  onCategorySelected,
}: CategoryManagementModalProps) {
  const [newDraft, setNewDraft] = useState<CategoryDraft>(() => emptyDraft());
  const [categoryMessage, setCategoryMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CategoryDraft | null>(null);
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [presets, setPresets] = useState<VariationPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedNewPresetId, setSelectedNewPresetId] = useState('');
  const [selectedEditPresetId, setSelectedEditPresetId] = useState('');
  const editTitleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [apiCategories, apiPresets] = await Promise.all([
          adminFetchCategories(),
          adminFetchVariationPresets(),
        ]);
        const normalized = normalizeCategoriesList(apiCategories);
        setAdminCategories(normalized);
        setPresets(apiPresets);
        onCategoriesChange(normalized);
        setEditCategoryId(null);
        setEditDraft(null);
        setCategoryMessage('');
      } catch (error) {
        console.error('Failed to load category options', error);
        setCategoryMessage('Could not load categories or presets.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setAdminCategories(normalizeCategoriesList(categories));
  }, [categories, open]);

  useEffect(() => {
    if (editCategoryId && editTitleRef.current) {
      editTitleRef.current.focus();
      editTitleRef.current.select();
    }
  }, [editCategoryId]);

  const sanitizeShippingInput = (value: string): string => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;
    return `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)}`;
  };

  const formatShippingDisplay = (value: string): string => {
    const sanitized = sanitizeShippingInput(value);
    return sanitized ? `$${sanitized}` : '';
  };

  const formatShippingValue = (value: string): string => {
    const sanitized = sanitizeShippingInput(value);
    if (!sanitized) return '';
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : '';
  };

  const normalizeShippingInput = (raw: string): number | null => {
    const sanitized = sanitizeShippingInput(raw);
    if (!sanitized) return 0;
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100);
  };

  const updateDraftGroups = (
    target: 'new' | 'edit',
    updater: (groups: VariationGroup[]) => VariationGroup[]
  ) => {
    const apply = (draft: CategoryDraft | null) =>
      draft ? { ...draft, optionGroups: normalizeVariationGroups(updater(draft.optionGroups)) } : draft;
    if (target === 'new') setNewDraft((prev) => apply(prev)!);
    else setEditDraft((prev) => apply(prev));
  };

  const applyPreset = (target: 'new' | 'edit', presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    updateDraftGroups(target, (groups) => [...groups, ...cloneGroups(preset.groups)]);
  };

  const handleAddCategory = async () => {
    const trimmed = newDraft.name.trim();
    if (!trimmed) {
      setCategoryMessage('Title is required.');
      return;
    }
    const normalizedShipping = normalizeShippingInput(newDraft.shipping);
    if (normalizedShipping === null) {
      setCategoryMessage('Shipping must be a non-negative number.');
      return;
    }
    const optionGroups = normalizeVariationGroups(newDraft.optionGroups);
    const maxSortOrder = adminCategories.reduce((max, cat) => Math.max(max, cat.sortOrder ?? 0), -1);
    try {
      const created = await adminCreateCategory({
        name: trimmed,
        subtitle: newDraft.subtitle.trim() || undefined,
        shippingCents: normalizedShipping,
        sortOrder: Math.max(0, maxSortOrder + 1),
        optionGroups,
      });
      if (created) {
        const updated = normalizeCategoriesList([...adminCategories, created]);
        setAdminCategories(updated);
        onCategoriesChange(updated);
        onCategorySelected?.(created.name);
        setNewDraft(emptyDraft());
        setSelectedNewPresetId('');
        setCategoryMessage('');
      }
    } catch (error) {
      console.error('Failed to create category', error);
      setCategoryMessage('Could not create category.');
    }
  };

  const handleSaveEdit = async (cat: Category) => {
    if (!editDraft) return;
    const trimmedName = editDraft.name.trim();
    if (!trimmedName) {
      setCategoryMessage('Title is required.');
      return;
    }
    const normalized = normalizeShippingInput(editDraft.shipping);
    if (normalized === null) {
      setCategoryMessage('Shipping must be a non-negative number.');
      return;
    }
    const optionGroups = normalizeVariationGroups(editDraft.optionGroups);
    try {
      const updated = await adminUpdateCategory(cat.id, {
        name: trimmedName,
        subtitle: editDraft.subtitle.trim() || undefined,
        shippingCents: normalized,
        optionGroups,
      });
      if (updated) {
        const updatedList = normalizeCategoriesList(adminCategories.map((c) => (c.id === cat.id ? updated : c)));
        setAdminCategories(updatedList);
        onCategoriesChange(updatedList);
        setCategoryMessage('');
        setEditCategoryId(null);
        setEditDraft(null);
        setSelectedEditPresetId('');
      }
    } catch (error) {
      console.error('Failed to update category', error);
      setCategoryMessage('Could not update category.');
    }
  };

  const handleCreatePresetFromDraft = async () => {
    const name = newPresetName.trim();
    if (!name) {
      setCategoryMessage('Preset name is required.');
      return;
    }
    const groups = normalizeVariationGroups(editDraft?.optionGroups || newDraft.optionGroups);
    if (!groups.length) {
      setCategoryMessage('Add at least one option group before saving a preset.');
      return;
    }
    try {
      const created = await adminCreateVariationPreset({ name, groups: cloneGroups(groups) });
      if (created) {
        setPresets((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setNewPresetName('');
        setCategoryMessage('');
      }
    } catch (error) {
      console.error('Failed to create preset', error);
      setCategoryMessage('Could not create preset.');
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!window.confirm('Delete this preset? Existing categories that used copied options will not change.')) return;
    await adminDeleteVariationPreset(id);
    setPresets((prev) => prev.filter((preset) => preset.id !== id));
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await adminDeleteCategory(cat.id);
      const updated = normalizeCategoriesList(adminCategories.filter((c) => c.id !== cat.id));
      setAdminCategories(updated);
      onCategoriesChange(updated);
      if (editCategoryId === cat.id) {
        setEditCategoryId(null);
        setEditDraft(null);
      }
    } catch (error) {
      console.error('Failed to delete category', error);
      setCategoryMessage('Could not delete category.');
    }
  };

  const handleMoveCategory = async (index: number, delta: number) => {
    if (isReordering) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= adminCategories.length) return;
    const previous = adminCategories;
    const swapped = [...adminCategories];
    [swapped[index], swapped[nextIndex]] = [swapped[nextIndex], swapped[index]];
    const reindexed = swapped.map((cat, idx) => ({ ...cat, sortOrder: idx }));
    setAdminCategories(reindexed);
    onCategoriesChange(reindexed);
    setIsReordering(true);
    try {
      for (const cat of reindexed) {
        await adminUpdateCategory(cat.id, { sortOrder: cat.sortOrder });
      }
      setCategoryMessage('');
    } catch (error) {
      console.error('Failed to update category order', error);
      setAdminCategories(previous);
      onCategoriesChange(previous);
      setCategoryMessage('Could not update category order.');
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      contentClassName="w-[min(1100px,calc(100vw-1.5rem))] max-w-none"
    >
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0">
        <div className="flex items-start justify-between gap-4 border-b border-driftwood/60 px-5 py-5 sm:px-7">
          <DialogHeader>
            <DialogTitle>Category Management</DialogTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal/70">
              Manage categories, default product options, and reusable variation presets.
            </p>
          </DialogHeader>
          <button type="button" onClick={onClose} className="lux-button--ghost shrink-0 px-4 py-2 text-[10px]">
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-7">
          {categoryMessage && (
            <div className="rounded-shell border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {categoryMessage}
            </div>
          )}

          <section className="lux-panel space-y-5 p-5 sm:p-6">
            <div>
              <p className="ca-admin-heading text-lg">Add New Category</p>
              <p className="mt-1 text-sm text-charcoal/65">
                Create the category, optional subtitle, shipping value, and default product options in one place.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Input label="Title" value={newDraft.name} onChange={(value) => setNewDraft((p) => ({ ...p, name: value }))} />
              <Input
                label="Subtitle"
                value={newDraft.subtitle}
                onChange={(value) => setNewDraft((p) => ({ ...p, subtitle: value }))}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-[220px]">
                <label className="lux-label mb-2 block">Shipping</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatShippingDisplay(newDraft.shipping)}
                  onChange={(e) => setNewDraft((p) => ({ ...p, shipping: sanitizeShippingInput(e.target.value) }))}
                  onBlur={(e) => setNewDraft((p) => ({ ...p, shipping: formatShippingValue(e.target.value) }))}
                  placeholder="$0.00"
                  className="lux-input min-h-[46px] text-base"
                />
              </div>
              <button type="button" onClick={handleAddCategory} className="lux-button px-5 py-3 text-[10px]">
                Add Category
              </button>
            </div>
          </section>

          <VariationEditor
            title="Default Product Options"
            subtitle="These options automatically appear on products in this category unless a product uses custom options."
            groups={newDraft.optionGroups}
            presets={presets}
            selectedPresetId={selectedNewPresetId}
            onSelectedPresetChange={setSelectedNewPresetId}
            onApplyPreset={() => {
              applyPreset('new', selectedNewPresetId);
              setSelectedNewPresetId('');
            }}
            onGroupsChange={(groups) => setNewDraft((p) => ({ ...p, optionGroups: groups }))}
          />

          <section className="lux-panel space-y-5 p-5 sm:p-6">
            <div>
              <p className="ca-admin-heading text-lg">Variation Presets</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-charcoal/65">
                Create reusable option sets like Trim Color, Shell Dish Options, or Napkin Ring Set Size.
                Applying a preset copies its option groups into a category.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-end">
              <Input
                label="Preset Name"
                value={newPresetName}
                onChange={setNewPresetName}
                placeholder="Example: Shell Dish Options"
              />
              <button type="button" onClick={handleCreatePresetFromDraft} className="lux-button--ghost px-5 py-3 text-[10px]">
                Save Current Options as Preset
              </button>
            </div>

            {presets.length === 0 ? (
              <div className="ca-admin-empty-state">No variation presets yet.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {presets.map((preset) => (
                  <div key={preset.id} className="rounded-[18px] border border-driftwood/60 bg-white/85 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-serif text-lg text-deep-ocean">{preset.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-charcoal/55">
                          {preset.groups.length} group{preset.groups.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        className="rounded-full p-2 text-charcoal/50 transition hover:bg-red-50 hover:text-red-700"
                        aria-label={`Delete ${preset.name} preset`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {preset.groups.length > 0 && (
                      <p className="mt-3 text-sm leading-6 text-charcoal/65">
                        {preset.groups.map((group) => group.label || 'Untitled group').join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lux-panel overflow-hidden p-0">
            <div className="border-b border-driftwood/60 px-5 py-4 sm:px-6">
              <p className="ca-admin-heading text-lg">Existing Categories</p>
              <p className="mt-1 text-sm text-charcoal/65">Edit, reorder, or delete saved shop categories.</p>
            </div>

            <div className="max-h-[620px] overflow-y-auto divide-y divide-driftwood/60">
              {isLoading ? (
                <div className="flex items-center gap-2 px-5 py-5 text-sm text-charcoal/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading categories...
                </div>
              ) : adminCategories.length === 0 ? (
                <div className="ca-admin-empty-state m-5">No categories yet.</div>
              ) : (
                adminCategories.map((cat, index) => {
                  const groups = categoryGroups(cat);
                  const isEditing = editCategoryId === cat.id && !!editDraft;
                  return (
                    <div key={cat.id} className="space-y-4 px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-xl text-deep-ocean">{cat.name || 'Unnamed Category'}</p>
                          {cat.subtitle && <p className="mt-1 text-sm leading-6 text-charcoal/65">{cat.subtitle}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="ca-admin-badge">Order {index + 1}</span>
                            <span className="ca-admin-badge">
                              {groups.length} option group{groups.length === 1 ? '' : 's'}
                            </span>
                            <span className="ca-admin-badge">
                              Shipping {typeof cat.shippingCents === 'number' && cat.shippingCents > 0 ? `$${(cat.shippingCents / 100).toFixed(2)}` : '$0.00'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(index, -1)}
                            disabled={index === 0 || isReordering}
                            className="lux-button--ghost px-3 py-2 text-[10px] disabled:opacity-40"
                            aria-label={`Move ${cat.name} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(index, 1)}
                            disabled={index === adminCategories.length - 1 || isReordering}
                            className="lux-button--ghost px-3 py-2 text-[10px] disabled:opacity-40"
                            aria-label={`Move ${cat.name} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="lux-button--ghost px-4 py-2 text-[10px]"
                            onClick={() => {
                              if (editCategoryId === cat.id) {
                                setEditCategoryId(null);
                                setEditDraft(null);
                                return;
                              }
                              const cents = typeof cat.shippingCents === 'number' ? cat.shippingCents : 0;
                              setEditCategoryId(cat.id);
                              setEditDraft({
                                name: cat.name || '',
                                subtitle: cat.subtitle || '',
                                shipping: cents > 0 ? (cents / 100).toFixed(2) : '',
                                optionGroups: categoryGroups(cat),
                              });
                              setSelectedEditPresetId('');
                            }}
                          >
                            {isEditing ? 'Close Edit' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full p-2 text-charcoal/60 transition hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteCategory(cat)}
                            aria-label={`Delete ${cat.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {isEditing && editDraft && (
                        <div className="rounded-[22px] border border-driftwood/70 bg-linen/60 p-4 sm:p-5">
                          <div className="mb-5 rounded-[16px] border border-driftwood/60 bg-white/80 px-4 py-3">
                            <p className="lux-label">Editing: {cat.name || 'Unnamed Category'}</p>
                            <p className="mt-1 text-sm text-charcoal/60">Update this category, then save or cancel below.</p>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <Input
                              inputRef={editTitleRef}
                              label="Title"
                              value={editDraft.name}
                              onChange={(value) => setEditDraft((p) => (p ? { ...p, name: value } : p))}
                            />
                            <Input
                              label="Subtitle"
                              value={editDraft.subtitle}
                              onChange={(value) => setEditDraft((p) => (p ? { ...p, subtitle: value } : p))}
                            />
                          </div>

                          <div className="mt-4 w-full sm:max-w-[220px]">
                            <label className="lux-label mb-2 block">Shipping</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatShippingDisplay(editDraft.shipping)}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, shipping: sanitizeShippingInput(e.target.value) } : p))}
                              onBlur={(e) => setEditDraft((p) => (p ? { ...p, shipping: formatShippingValue(e.target.value) } : p))}
                              placeholder="$0.00"
                              className="lux-input min-h-[46px] text-base"
                            />
                          </div>

                          <div className="mt-5">
                            <VariationEditor
                              title="Default Product Options"
                              subtitle="These options automatically appear on products in this category unless a product has custom options."
                              groups={editDraft.optionGroups}
                              presets={presets}
                              selectedPresetId={selectedEditPresetId}
                              onSelectedPresetChange={setSelectedEditPresetId}
                              onApplyPreset={() => {
                                applyPreset('edit', selectedEditPresetId);
                                setSelectedEditPresetId('');
                              }}
                              onGroupsChange={(groups) => setEditDraft((p) => (p ? { ...p, optionGroups: groups } : p))}
                            />
                          </div>

                          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditCategoryId(null);
                                setEditDraft(null);
                                setSelectedEditPresetId('');
                              }}
                              className="lux-button--ghost px-5 py-3 text-[10px]"
                            >
                              Cancel
                            </button>
                            <button type="button" onClick={() => handleSaveEdit(cat)} className="lux-button px-5 py-3 text-[10px]">
                              Save Category
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Input({
  label,
  value,
  onChange,
  inputRef,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="lux-label mb-2 block">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="lux-input min-h-[46px] text-base"
      />
    </div>
  );
}

function VariationEditor({
  title,
  subtitle,
  groups,
  presets,
  selectedPresetId,
  onSelectedPresetChange,
  onApplyPreset,
  onGroupsChange,
}: {
  title: string;
  subtitle: string;
  groups: VariationGroup[];
  presets: VariationPreset[];
  selectedPresetId: string;
  onSelectedPresetChange: (id: string) => void;
  onApplyPreset: () => void;
  onGroupsChange: (groups: VariationGroup[]) => void;
}) {
  const updateGroup = (groupId: string, updater: (group: VariationGroup) => VariationGroup) => {
    onGroupsChange(groups.map((group) => (group.id === groupId ? updater(group) : group)));
  };

  return (
    <section className="lux-panel space-y-5 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="ca-admin-heading text-lg">{title}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-charcoal/65">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => onGroupsChange([...groups, { ...createVariationGroup(''), label: 'New Option Group' }])}
          className="lux-button--ghost px-5 py-3 text-[10px]"
        >
          Add Option Group
        </button>
      </div>

      <div className="rounded-[18px] border border-driftwood/60 bg-white/75 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
          <div>
            <label className="lux-label mb-2 block">Apply Preset</label>
            <select
              value={selectedPresetId}
              onChange={(e) => onSelectedPresetChange(e.target.value)}
              className="lux-input min-h-[46px] text-base"
            >
              <option value="">Select preset</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!selectedPresetId}
            onClick={onApplyPreset}
            className="lux-button--ghost px-5 py-3 text-[10px] disabled:opacity-50"
          >
            Apply Preset
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-charcoal/55">
          Applying a preset copies its option groups into this category. You can edit them after applying.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="ca-admin-empty-state">No default product options for this category.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-[20px] border border-driftwood/70 bg-linen/60 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-end">
                <div>
                  <label className="lux-label mb-2 block">Group Name</label>
                  <input
                    value={group.label}
                    onChange={(e) => updateGroup(group.id, (current) => ({ ...current, label: e.target.value }))}
                    placeholder="Trim"
                    className="lux-input min-h-[46px] text-base"
                  />
                </div>
                <label className="flex min-h-[46px] items-center gap-3 rounded-[14px] border border-driftwood/60 bg-white/80 px-4 text-xs uppercase tracking-[0.2em] text-charcoal/70">
                  <input
                    type="checkbox"
                    checked={group.required !== false}
                    onChange={(e) => updateGroup(group.id, (current) => ({ ...current, required: e.target.checked }))}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => onGroupsChange(groups.filter((item) => item.id !== group.id))}
                  className="lux-button--ghost px-4 py-3 text-[10px] text-red-700"
                >
                  Delete Group
                </button>
              </div>

              <div className="mt-3 rounded-[14px] border border-driftwood/50 bg-white/70 px-4 py-2 text-xs text-charcoal/60">
                Input type: Dropdown / Select
              </div>

              <div className="mt-4 space-y-3">
                <p className="lux-label">Options</p>
                {group.options.map((option, optionIndex) => (
                  <div key={option.id} className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
                    <input
                      value={option.label}
                      onChange={(e) =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          options: current.options.map((item) =>
                            item.id === option.id
                              ? { ...item, label: e.target.value, value: e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') }
                              : item
                          ),
                        }))
                      }
                      placeholder={optionIndex === 0 ? 'Gold' : 'Option label'}
                      className="lux-input min-h-[44px] text-base"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          options: current.options.filter((item) => item.id !== option.id),
                        }))
                      }
                      className="lux-button--ghost px-4 py-2 text-[10px]"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      options: [...current.options, createVariationOption('', current.options.length)],
                    }))
                  }
                  className="lux-button--ghost px-4 py-2 text-[10px]"
                >
                  Add Option
                </button>
              </div>

              <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-charcoal/50">Group {groupIndex + 1}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
