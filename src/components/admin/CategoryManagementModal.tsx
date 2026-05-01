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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex w-full max-w-5xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-driftwood/60 px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-center lux-heading text-lg">Category Management</DialogTitle>
            <p className="text-center text-sm text-charcoal/70">
              Manage categories, default product options, and reusable variation presets.
            </p>
          </DialogHeader>
          <button type="button" onClick={onClose} className="lux-button--ghost px-3 py-1 text-[10px]">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4 space-y-4">
          {categoryMessage && (
            <div className="rounded-shell border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {categoryMessage}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="lux-panel p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.7fr_150px] md:items-end">
                <Input label="Title" value={newDraft.name} onChange={(value) => setNewDraft((p) => ({ ...p, name: value }))} />
                <Input label="Subtitle" value={newDraft.subtitle} onChange={(value) => setNewDraft((p) => ({ ...p, subtitle: value }))} />
                <div>
                  <label className="lux-label text-[10px]">Shipping</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatShippingDisplay(newDraft.shipping)}
                    onChange={(e) => setNewDraft((p) => ({ ...p, shipping: sanitizeShippingInput(e.target.value) }))}
                    onBlur={(e) => setNewDraft((p) => ({ ...p, shipping: formatShippingValue(e.target.value) }))}
                    placeholder="$0.00"
                    className="lux-input text-sm mt-1"
                  />
                </div>
                <button type="button" onClick={handleAddCategory} className="lux-button px-4 py-2 text-[10px]">
                  Add Category
                </button>
              </div>
              <VariationEditor
                title="Default Product Options"
                subtitle="These options automatically appear on products in this category unless a product later uses custom options."
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
            </div>

            <div className="lux-panel p-4 space-y-3">
              <div>
                <p className="lux-label">Variation Presets</p>
                <p className="text-xs text-charcoal/60 mt-1">
                  Applying a preset copies its option groups. Categories can be edited after applying.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Preset name"
                  className="lux-input text-sm"
                />
                <button type="button" onClick={handleCreatePresetFromDraft} className="lux-button--ghost px-3 py-2 text-[10px]">
                  Save Current
                </button>
              </div>
              <div className="max-h-64 overflow-auto divide-y divide-driftwood/50 border border-driftwood/60 bg-white">
                {presets.length === 0 ? (
                  <p className="p-3 text-sm text-charcoal/60">No presets yet.</p>
                ) : (
                  presets.map((preset) => (
                    <div key={preset.id} className="flex items-start justify-between gap-3 p-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] font-semibold text-deep-ocean">{preset.name}</p>
                        <p className="text-xs text-charcoal/60">{preset.groups.length} group{preset.groups.length === 1 ? '' : 's'}</p>
                      </div>
                      <button type="button" onClick={() => handleDeletePreset(preset.id)} className="text-charcoal/50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="border border-driftwood/60 rounded-shell-lg">
            <div className="max-h-[520px] overflow-y-auto divide-y divide-driftwood/60">
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-charcoal/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : adminCategories.length === 0 ? (
                <p className="px-3 py-2 text-sm text-charcoal/60">No categories yet.</p>
              ) : (
                adminCategories.map((cat, index) => (
                  <div key={cat.id} className="px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal truncate">
                          {cat.name || 'Unnamed Category'}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-charcoal/50">
                          Order {index + 1} · {categoryGroups(cat).length} option group{categoryGroups(cat).length === 1 ? '' : 's'}
                        </div>
                        {cat.subtitle && <div className="text-[10px] uppercase tracking-[0.18em] text-charcoal/60 truncate">{cat.subtitle}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleMoveCategory(index, -1)} disabled={index === 0 || isReordering} className="lux-button--ghost px-2 py-1 text-[10px] disabled:opacity-40">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleMoveCategory(index, 1)} disabled={index === adminCategories.length - 1 || isReordering} className="lux-button--ghost px-2 py-1 text-[10px] disabled:opacity-40">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="lux-button--ghost px-3 py-1 text-[10px]"
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
                          {editCategoryId === cat.id ? 'Close' : 'Edit'}
                        </button>
                        <button type="button" className="text-charcoal/60 hover:text-red-600" onClick={() => handleDeleteCategory(cat)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {editCategoryId === cat.id && editDraft && (
                      <div className="mt-3 lux-panel p-4 space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input inputRef={editTitleRef} label="Title" value={editDraft.name} onChange={(value) => setEditDraft((p) => (p ? { ...p, name: value } : p))} />
                          <Input label="Subtitle" value={editDraft.subtitle} onChange={(value) => setEditDraft((p) => (p ? { ...p, subtitle: value } : p))} />
                          <div>
                            <label className="lux-label text-[10px]">Shipping</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatShippingDisplay(editDraft.shipping)}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, shipping: sanitizeShippingInput(e.target.value) } : p))}
                              onBlur={(e) => setEditDraft((p) => (p ? { ...p, shipping: formatShippingValue(e.target.value) } : p))}
                              placeholder="$0.00"
                              className="lux-input text-sm mt-1"
                            />
                          </div>
                        </div>
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
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditCategoryId(null)} className="lux-button--ghost px-4 py-2 text-[10px]">
                            Cancel
                          </button>
                          <button type="button" onClick={() => handleSaveEdit(cat)} className="lux-button px-4 py-2 text-[10px]">
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <label className="lux-label text-[10px]">{label}</label>
      <input ref={inputRef} type="text" value={value} onChange={(e) => onChange(e.target.value)} className="lux-input text-sm mt-1" />
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
    <section className="space-y-3 rounded-shell border border-driftwood/60 bg-white/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="lux-label">{title}</p>
          <p className="text-xs text-charcoal/60 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => onGroupsChange([...groups, { ...createVariationGroup(''), label: 'New Option Group' }])}
          className="lux-button--ghost px-3 py-2 text-[10px]"
        >
          Add Option Group
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <select value={selectedPresetId} onChange={(e) => onSelectedPresetChange(e.target.value)} className="lux-input text-sm">
          <option value="">Select preset</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!selectedPresetId} onClick={onApplyPreset} className="lux-button--ghost px-4 py-2 text-[10px] disabled:opacity-50">
          Apply Preset
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-charcoal/60">No default product options for this category.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-shell border border-driftwood/60 bg-linen/60 p-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div>
                  <label className="lux-label text-[10px]">Group Name</label>
                  <input
                    value={group.label}
                    onChange={(e) => updateGroup(group.id, (current) => ({ ...current, label: e.target.value }))}
                    placeholder="Trim"
                    className="lux-input text-sm mt-1"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-charcoal/70">
                  <input
                    type="checkbox"
                    checked={group.required !== false}
                    onChange={(e) => updateGroup(group.id, (current) => ({ ...current, required: e.target.checked }))}
                  />
                  Required
                </label>
                <button type="button" onClick={() => onGroupsChange(groups.filter((item) => item.id !== group.id))} className="text-red-700 text-xs uppercase tracking-[0.18em]">
                  Delete Group
                </button>
              </div>
              <div className="text-xs text-charcoal/60">Input type: Dropdown / Select</div>
              <div className="space-y-2">
                {group.options.map((option, optionIndex) => (
                  <div key={option.id} className="flex gap-2">
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
                      className="lux-input text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          options: current.options.filter((item) => item.id !== option.id),
                        }))
                      }
                      className="lux-button--ghost px-3 py-2 text-[10px]"
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
                  className="lux-button--ghost px-3 py-2 text-[10px]"
                >
                  Add Option
                </button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-charcoal/50">Group {groupIndex + 1}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
