import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  adminCreateCategory,
  adminCreateVariationPreset,
  adminDeleteCategory,
  adminDeleteVariationPreset,
  adminFetchCategories,
  adminFetchVariationPresets,
  adminUpdateCategory,
  adminUpdateVariationPreset,
} from '../../lib/adminApi';
import type { Category, VariationGroup, VariationPreset } from '../../lib/types';
import { createVariationGroup, normalizeCategoryKey, normalizeVariationGroups } from '../../lib/categoryOptions';

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

type ToolView = 'launcher' | 'create' | 'edit' | 'presets';

type ChoiceValueDraft = {
  id: string;
  label: string;
  priceIncreaseCents: number;
};

type ChoiceBuilderDraft = {
  id: string | null;
  label: string;
  required: boolean;
  choices: ChoiceValueDraft[];
};

const emptyDraft = (): CategoryDraft => ({
  name: '',
  subtitle: '',
  shipping: '',
  optionGroups: [],
});

const emptyChoiceBuilderDraft = (): ChoiceBuilderDraft => ({
  id: null,
  label: '',
  required: true,
  choices: [
    { id: crypto.randomUUID(), label: '', priceIncreaseCents: 0 },
    { id: crypto.randomUUID(), label: '', priceIncreaseCents: 0 },
  ],
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
  const [toolView, setToolView] = useState<ToolView>('launcher');
  const [newDraft, setNewDraft] = useState<CategoryDraft>(() => emptyDraft());
  const [categoryMessage, setCategoryMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CategoryDraft | null>(null);
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [presets, setPresets] = useState<VariationPreset[]>([]);
  const [selectedEditPresetId, setSelectedEditPresetId] = useState('');
  const [showCreatePresets, setShowCreatePresets] = useState(false);
  const [choiceBuilderDraft, setChoiceBuilderDraft] = useState<ChoiceBuilderDraft>(() => emptyChoiceBuilderDraft());
  const [editChoiceBuilderDraft, setEditChoiceBuilderDraft] = useState<ChoiceBuilderDraft>(() => emptyChoiceBuilderDraft());
  const [editChoiceGroupId, setEditChoiceGroupId] = useState<string | null>(null);
  const [presetDraftId, setPresetDraftId] = useState<string | null>(null);
  const [presetBuilderDraft, setPresetBuilderDraft] = useState<ChoiceBuilderDraft>(() => emptyChoiceBuilderDraft());
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [applyCategoryIds, setApplyCategoryIds] = useState<string[]>([]);
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
        setToolView('launcher');
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

  const closeAll = () => {
    setToolView('launcher');
    setCategoryMessage('');
    onClose();
  };

  const goBack = () => {
    setToolView('launcher');
    setCategoryMessage('');
    setEditCategoryId(null);
    setEditDraft(null);
    setSelectedEditPresetId('');
    setShowCreatePresets(false);
    setChoiceBuilderDraft(emptyChoiceBuilderDraft());
    setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
    setEditChoiceGroupId(null);
    setApplyTemplateId('');
    setApplyCategoryIds([]);
    resetPresetDraft();
  };

  const resetPresetDraft = () => {
    setPresetDraftId(null);
    setPresetBuilderDraft(emptyChoiceBuilderDraft());
  };

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

  const usePresetForNewCategory = (preset: VariationPreset) => {
    const presetLabels = new Set(normalizeVariationGroups(preset.groups).map((group) => group.label.trim().toLowerCase()).filter(Boolean));
    const duplicate = newDraft.optionGroups.find((group) => presetLabels.has(group.label.trim().toLowerCase()));
    if (duplicate) {
      setCategoryMessage(`"${duplicate.label}" is already in Current Choices for This Category.`);
      return;
    }
    updateDraftGroups('new', (groups) => [...groups, ...cloneGroups(preset.groups)]);
    setCategoryMessage('');
  };

  const uniquePresetName = (nameInput: string): string => {
    const base = nameInput.trim();
    if (!base) return '';
    const existing = new Set(presets.map((preset) => preset.name.trim().toLowerCase()));
    if (!existing.has(base.toLowerCase())) return base;
    let suffix = 2;
    while (existing.has(`${base} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    return `${base} ${suffix}`;
  };

  const validateCreateGroups = (groupsInput: VariationGroup[]): VariationGroup[] | null => {
    for (const group of groupsInput) {
      if (!group.label.trim()) {
        setCategoryMessage('Add a choice name, like Trim or Shell Type.');
        return null;
      }
      if (!group.options.some((option) => option.label.trim())) {
        setCategoryMessage('Each choice needs a name, like Gold or Oyster Shell.');
        return null;
      }
      if (group.options.some((option) => !option.label.trim())) {
        setCategoryMessage('Each choice needs a name, like Gold or Oyster Shell.');
        return null;
      }
    }
    const normalized = normalizeVariationGroups(groupsInput);
    if (groupsInput.length > 0 && !normalized.length) {
      setCategoryMessage('Each choice needs a name, like Gold or Oyster Shell.');
      return null;
    }
    return normalized;
  };

  const choiceDraftToGroup = (draft: ChoiceBuilderDraft): VariationGroup | null => {
    const label = draft.label.trim();
    if (!label) {
      setCategoryMessage('Add a choice name, like Trim or Shell Type.');
      return null;
    }
    const filledChoices = draft.choices.filter((choice) => choice.label.trim());
    if (filledChoices.length !== draft.choices.length || !filledChoices.length) {
      setCategoryMessage('Each choice needs a name, like Gold or Oyster Shell.');
      return null;
    }
    return {
      id: draft.id || crypto.randomUUID(),
      label,
      inputType: 'select',
      required: draft.required,
      displayOrder: newDraft.optionGroups.length,
      enabled: true,
      presetId: null,
      options: filledChoices.map((choice, index) => ({
        id: choice.id,
        label: choice.label.trim(),
        value: normalizeCategoryKey(choice.label),
        priceIncreaseCents: Math.max(0, Math.round(Number(choice.priceIncreaseCents || 0))),
        displayOrder: index,
        enabled: true,
      })),
    };
  };

  const savePresetFromBuilder = async (draft: ChoiceBuilderDraft, presetId: string | null) => {
    if (!draft.label.trim()) {
      setCategoryMessage('Add a Choice Name before saving as a preset.');
      return;
    }
    const group = choiceDraftToGroup(draft);
    if (!group) return;
    const name = presetId ? group.label : uniquePresetName(group.label);
    setIsSaving(true);
    try {
      const saved = presetId
        ? await adminUpdateVariationPreset(presetId, { name, groups: cloneGroups([group]) })
        : await adminCreateVariationPreset({ name, groups: cloneGroups([group]) });
      if (saved) {
        setPresets((prev) => {
          const withoutSaved = prev.filter((preset) => preset.id !== saved.id);
          return [...withoutSaved, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        resetPresetDraft();
        setCategoryMessage(presetId ? 'Preset updated.' : 'Preset saved.');
      }
    } catch (error) {
      console.error('Failed to save preset', error);
      setCategoryMessage('Could not save preset.');
    } finally {
      setIsSaving(false);
    }
  };

  const addBuilderChoiceToCategory = () => {
    const group = choiceDraftToGroup(choiceBuilderDraft);
    if (!group) return false;
    setNewDraft((prev) => {
      const existingIndex = group.id ? prev.optionGroups.findIndex((item) => item.id === group.id) : -1;
      const nextGroups =
        existingIndex >= 0
          ? prev.optionGroups.map((item, index) => (index === existingIndex ? { ...group, displayOrder: index } : item))
          : [...prev.optionGroups, { ...group, displayOrder: prev.optionGroups.length }];
      return { ...prev, optionGroups: normalizeVariationGroups(nextGroups) };
    });
    setChoiceBuilderDraft(emptyChoiceBuilderDraft());
    setCategoryMessage('');
    return true;
  };

  const addBuilderChoiceToEditCategory = () => {
    if (!editDraft) return false;
    const group = choiceDraftToGroup(editChoiceBuilderDraft);
    if (!group) return false;
    const targetId = editChoiceGroupId || group.id || crypto.randomUUID();
    setEditDraft((prev) => {
      if (!prev) return prev;
      const existingIndex = prev.optionGroups.findIndex((item) => item.id === targetId);
      const nextGroup = { ...group, id: targetId };
      const nextGroups =
        existingIndex >= 0
          ? prev.optionGroups.map((item, index) => (index === existingIndex ? { ...nextGroup, displayOrder: index } : item))
          : [...prev.optionGroups, { ...nextGroup, displayOrder: prev.optionGroups.length }];
      return { ...prev, optionGroups: normalizeVariationGroups(nextGroups) };
    });
    setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
    setEditChoiceGroupId(null);
    setCategoryMessage('');
    return true;
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
    const hasUnaddedChoiceDraft =
      choiceBuilderDraft.label.trim() ||
      choiceBuilderDraft.choices.some((choice) => choice.label.trim() || choice.priceIncreaseCents > 0);
    if (hasUnaddedChoiceDraft) {
      setCategoryMessage('Add the current choice to the category, or remove the unfinished choice before creating the category.');
      return;
    }
    const optionGroups = validateCreateGroups(newDraft.optionGroups);
    if (!optionGroups) return;
    const maxSortOrder = adminCategories.reduce((max, cat) => Math.max(max, cat.sortOrder ?? 0), -1);
    setIsSaving(true);
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
        setShowCreatePresets(false);
        setCategoryMessage('');
        closeAll();
      }
    } catch (error) {
      console.error('Failed to create category', error);
      setCategoryMessage('Could not create category.');
    } finally {
      setIsSaving(false);
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
    const hasUnaddedChoiceDraft =
      editChoiceBuilderDraft.label.trim() ||
      editChoiceBuilderDraft.choices.some((choice) => choice.label.trim() || choice.priceIncreaseCents > 0);
    if (hasUnaddedChoiceDraft) {
      setCategoryMessage('Add the current choice to the category, or cancel the unfinished choice before saving changes.');
      return;
    }
    const optionGroups = normalizeVariationGroups(editDraft.optionGroups);
    setIsSaving(true);
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
        setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
        setEditChoiceGroupId(null);
      }
    } catch (error) {
      console.error('Failed to update category', error);
      setCategoryMessage('Could not update category.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePreset = async () => savePresetFromBuilder(presetBuilderDraft, presetDraftId);

  const handleSaveCurrentOptionsAsPreset = async (
    nameInput: string,
    groupsInput: VariationGroup[],
    onSaved: () => void
  ) => {
    const name = nameInput.trim();
    if (!name) {
      setCategoryMessage('Preset name is required.');
      return;
    }
    const groups = normalizeVariationGroups(groupsInput);
    if (!groups.length) {
      setCategoryMessage('Add at least one customer choice before saving a preset.');
      return;
    }
    setIsSaving(true);
    try {
      const created = await adminCreateVariationPreset({ name, groups: cloneGroups(groups) });
      if (created) {
        setPresets((prev) => [...prev.filter((preset) => preset.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)));
        onSaved();
        setCategoryMessage('Preset saved.');
      }
    } catch (error) {
      console.error('Failed to create preset', error);
      setCategoryMessage('Could not save preset.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPreset = (preset: VariationPreset) => {
    setPresetDraftId(preset.id);
    setPresetBuilderDraft(groupToChoiceBuilderDraft(preset.groups[0] || createVariationGroup(preset.name)));
    setCategoryMessage('');
  };

  const handleDeletePreset = async (id: string) => {
    if (!window.confirm('Delete this preset? Existing categories that used copied choices will not change.')) return;
    try {
      await adminDeleteVariationPreset(id);
      setPresets((prev) => prev.filter((preset) => preset.id !== id));
      if (presetDraftId === id) resetPresetDraft();
    } catch (error) {
      console.error('Failed to delete preset', error);
      setCategoryMessage('Could not delete preset.');
    }
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

  const startEditCategory = (cat: Category) => {
    const cents = typeof cat.shippingCents === 'number' ? cat.shippingCents : 0;
    setEditCategoryId(cat.id);
    setEditDraft({
      name: cat.name || '',
      subtitle: cat.subtitle || '',
      shipping: cents > 0 ? (cents / 100).toFixed(2) : '',
      optionGroups: categoryGroups(cat),
    });
    setSelectedEditPresetId('');
    setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
    setEditChoiceGroupId(null);
    setCategoryMessage('');
  };

  const handleApplyTemplateToCategories = async () => {
    const template = presets.find((item) => item.id === applyTemplateId);
    if (!template) {
      setCategoryMessage('Choose a preset.');
      return;
    }
    if (!applyCategoryIds.length) {
      setCategoryMessage('Choose at least one category.');
      return;
    }
    const selectedIds = new Set(applyCategoryIds);
    const previous = adminCategories;
    const nextCategories = adminCategories.map((cat) =>
      selectedIds.has(cat.id) ? { ...cat, optionGroups: cloneGroups(template.groups) } : cat
    );
    setAdminCategories(nextCategories);
    onCategoriesChange(nextCategories);
    setIsSaving(true);
    try {
      const updatedById = new Map<string, Category>();
      for (const cat of adminCategories.filter((item) => selectedIds.has(item.id))) {
        const updated = await adminUpdateCategory(cat.id, { optionGroups: cloneGroups(template.groups) });
        if (updated) updatedById.set(cat.id, updated);
      }
      const updatedList = normalizeCategoriesList(
        nextCategories.map((cat) => updatedById.get(cat.id) || cat)
      );
      setAdminCategories(updatedList);
      onCategoriesChange(updatedList);
      setApplyTemplateId('');
      setApplyCategoryIds([]);
      setCategoryMessage('Preset added to selected categories.');
    } catch (error) {
      console.error('Failed to add preset to categories', error);
      setAdminCategories(previous);
      onCategoriesChange(previous);
      setCategoryMessage('Could not add preset to categories.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentEditCategory = adminCategories.find((cat) => cat.id === editCategoryId) || null;
  const modalWidth =
    toolView === 'launcher'
      ? '!w-[calc(100vw-1.5rem)] sm:!w-[min(calc(100vw-3rem),42rem)] !max-w-none !max-h-[90vh]'
      : '!w-[calc(100vw-1.5rem)] sm:!w-[min(calc(100vw-3rem),64rem)] !max-w-none !max-h-[90vh]';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAll()} contentClassName={modalWidth}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        {toolView === 'launcher' && (
          <LauncherView
            onClose={closeAll}
            onOpenCreate={() => setToolView('create')}
            onOpenEdit={() => setToolView('edit')}
            onOpenPresets={() => setToolView('presets')}
          />
        )}

        {toolView === 'create' && (
          <ModalShell
            title="Create New Category"
            subtitle="Add a new category with subtitle, shipping, and customer choices."
            onBack={goBack}
            onClose={closeAll}
          >
            <StatusMessage message={categoryMessage} />
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              <section className="space-y-4 rounded-[22px] border border-driftwood/65 bg-white/85 p-4 sm:p-5">
                <div>
                  <p className="ca-admin-heading text-lg">Category Details</p>
                  <p className="mt-1 text-sm text-charcoal/60">Name the category and set its default shipping.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Category Name" value={newDraft.name} onChange={(value) => setNewDraft((p) => ({ ...p, name: value }))} />
                  <Input
                    label="Subtitle"
                    value={newDraft.subtitle}
                    onChange={(value) => setNewDraft((p) => ({ ...p, subtitle: value }))}
                  />
                </div>
                <ShippingInput
                  value={newDraft.shipping}
                  onChange={(value) => setNewDraft((p) => ({ ...p, shipping: value }))}
                  sanitize={sanitizeShippingInput}
                  formatDisplay={formatShippingDisplay}
                  formatValue={formatShippingValue}
                />
              </section>

              <CreateCategoryChoicesEditor
                groups={newDraft.optionGroups}
                presets={presets}
                builderDraft={choiceBuilderDraft}
                showPresets={showCreatePresets}
                onTogglePresets={() => setShowCreatePresets((prev) => !prev)}
                onBuilderDraftChange={setChoiceBuilderDraft}
                onUsePreset={usePresetForNewCategory}
                onEditPreset={(preset) => {
                  handleEditPreset(preset);
                  setToolView('presets');
                }}
                onAddBuilderChoice={addBuilderChoiceToCategory}
                onAddBuilderAsPreset={() => {
                  if (!choiceBuilderDraft.label.trim()) {
                    setCategoryMessage('Add a Choice Name before saving as a preset.');
                    return;
                  }
                  const group = choiceDraftToGroup(choiceBuilderDraft);
                  if (!group) return;
                  void handleSaveCurrentOptionsAsPreset(uniquePresetName(group.label), [group], () => {
                    setChoiceBuilderDraft(emptyChoiceBuilderDraft());
                  });
                }}
                onEditGroup={(group) => {
                  setChoiceBuilderDraft(groupToChoiceBuilderDraft(group));
                }}
                onGroupsChange={(groups) => setNewDraft((p) => ({ ...p, optionGroups: groups }))}
              />
            </div>
            <ModalFooter>
              <button type="button" onClick={goBack} className="lux-button--ghost px-5 py-3 text-[10px]">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={isSaving}
                className="lux-button px-5 py-3 text-[10px] disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create Category'}
              </button>
            </ModalFooter>
          </ModalShell>
        )}

        {toolView === 'edit' && (
          <ModalShell
            title="Edit Existing Categories"
            subtitle="Update category names, subtitles, shipping, order, and customer choices."
            onBack={goBack}
            onClose={closeAll}
          >
            <StatusMessage message={categoryMessage} />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {currentEditCategory && editDraft ? (
                <div className="space-y-5">
                  <div className="rounded-[18px] border border-driftwood/60 bg-linen/55 px-4 py-3">
                    <p className="ca-admin-heading text-lg">Editing: {currentEditCategory.name || 'Unnamed Category'}</p>
                    <p className="mt-1 text-sm text-charcoal/60">Update this category's details, presets, and customer choices.</p>
                  </div>

                  <section className="space-y-4 rounded-[22px] border border-driftwood/65 bg-white/85 p-4 sm:p-5">
                    <div>
                      <p className="ca-admin-heading text-lg">Category Details</p>
                      <p className="mt-1 text-sm text-charcoal/60">Update the title, subtitle, and default shipping price.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
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
                    <ShippingInput
                      value={editDraft.shipping}
                      onChange={(value) => setEditDraft((p) => (p ? { ...p, shipping: value } : p))}
                      sanitize={sanitizeShippingInput}
                      formatDisplay={formatShippingDisplay}
                      formatValue={formatShippingValue}
                    />
                  </section>

                  <EditCategoryChoicesEditor
                    groups={editDraft.optionGroups}
                    presets={presets}
                    selectedPresetId={selectedEditPresetId}
                    builderDraft={editChoiceBuilderDraft}
                    editingGroupId={editChoiceGroupId}
                    onSelectedPresetChange={setSelectedEditPresetId}
                    onBuilderDraftChange={setEditChoiceBuilderDraft}
                    onUsePreset={() => {
                      applyPreset('edit', selectedEditPresetId);
                      setSelectedEditPresetId('');
                    }}
                    onAddBuilderChoice={addBuilderChoiceToEditCategory}
                    onAddBuilderAsPreset={() => {
                      if (!editChoiceBuilderDraft.label.trim()) {
                        setCategoryMessage('Add a Choice Name before saving as a preset.');
                        return;
                      }
                      const group = choiceDraftToGroup(editChoiceBuilderDraft);
                      if (!group) return;
                      void handleSaveCurrentOptionsAsPreset(uniquePresetName(group.label), [group], () => {
                        setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
                        setEditChoiceGroupId(null);
                      });
                    }}
                    onCancelChoiceEdit={() => {
                      setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
                      setEditChoiceGroupId(null);
                      setCategoryMessage('');
                    }}
                    onEditGroup={(group) => {
                      setEditChoiceBuilderDraft(groupToChoiceBuilderDraft(group));
                      setEditChoiceGroupId(group.id);
                      setCategoryMessage('');
                    }}
                    onGroupsChange={(groups) => setEditDraft((p) => (p ? { ...p, optionGroups: groups } : p))}
                  />
                </div>
              ) : (
                <CategoryList
                  categories={adminCategories}
                  isLoading={isLoading}
                  isReordering={isReordering}
                  onMove={handleMoveCategory}
                  onEdit={startEditCategory}
                  onDelete={handleDeleteCategory}
                />
              )}
            </div>
            <ModalFooter>
              {currentEditCategory && editDraft ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditCategoryId(null);
                      setEditDraft(null);
                      setSelectedEditPresetId('');
                      setEditChoiceBuilderDraft(emptyChoiceBuilderDraft());
                      setEditChoiceGroupId(null);
                    }}
                    className="lux-button--ghost px-5 py-3 text-[10px]"
                  >
                    Cancel Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(currentEditCategory)}
                    disabled={isSaving}
                    className="lux-button px-5 py-3 text-[10px] disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={goBack} className="lux-button--ghost px-5 py-3 text-[10px]">
                  Back to Category Tools
                </button>
              )}
            </ModalFooter>
          </ModalShell>
        )}

        {toolView === 'presets' && (
          <ModalShell
            title="Manage Presets"
            subtitle="Create, edit, and manage reusable presets for customer choices like Trim, Shell Type, or Set Size."
            onBack={goBack}
            onClose={closeAll}
          >
            <StatusMessage message={categoryMessage} />
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
              <section className="space-y-4">
                <div>
                  <p className="ca-admin-heading text-lg">{presetDraftId ? 'Edit Preset' : 'Create Preset'}</p>
                  <p className="mt-1 text-sm text-charcoal/60">Build the customer choice shoppers can select.</p>
                </div>
                <ChoiceBuilder
                  draft={presetBuilderDraft}
                  onDraftChange={setPresetBuilderDraft}
                />
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  {presetDraftId && (
                    <button type="button" onClick={resetPresetDraft} className="lux-button--ghost px-5 py-3 text-[10px]">
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    disabled={isSaving}
                    className="lux-button px-5 py-3 text-[10px] disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : presetDraftId ? 'Update Preset' : 'Save Preset'}
                  </button>
                </div>
              </section>

              <section className="space-y-4 border-t border-driftwood/60 pt-5">
                <div>
                  <p className="ca-admin-heading text-lg">Existing Presets</p>
                  <p className="mt-1 text-sm text-charcoal/60">Edit or delete reusable customer choice presets.</p>
                </div>
                <PresetList presets={presets} onEdit={handleEditPreset} onDelete={handleDeletePreset} />
              </section>

              <ApplyTemplateSection
                presets={presets}
                categories={adminCategories}
                selectedTemplateId={applyTemplateId}
                selectedCategoryIds={applyCategoryIds}
                isSaving={isSaving}
                onTemplateChange={setApplyTemplateId}
                onCategoryToggle={(id) =>
                  setApplyCategoryIds((prev) =>
                    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
                  )
                }
                onApply={handleApplyTemplateToCategories}
              />
            </div>
            <ModalFooter>
              <button type="button" onClick={goBack} className="lux-button--ghost px-5 py-3 text-[10px]">
                Back to Category Tools
              </button>
            </ModalFooter>
          </ModalShell>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LauncherView({
  onClose,
  onOpenCreate,
  onOpenEdit,
  onOpenPresets,
}: {
  onClose: () => void;
  onOpenCreate: () => void;
  onOpenEdit: () => void;
  onOpenPresets: () => void;
}) {
  return (
    <>
      <div className="border-b border-driftwood/60 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle>Category Tools</DialogTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal/70">
              Create categories, edit existing category details, and manage reusable presets.
            </p>
          </DialogHeader>
          <button type="button" onClick={onClose} className="lux-button--ghost shrink-0 px-4 py-2 text-[10px]">
            Close
          </button>
        </div>
      </div>
      <div className="grid gap-3 px-5 py-5 sm:px-7">
        <LauncherCard
          title="Create New"
          description="Add a new category with subtitle, shipping, and customer choices."
          onClick={onOpenCreate}
        />
        <LauncherCard
          title="Edit Existing"
          description="Update category names, subtitles, shipping, order, and customer choices."
          onClick={onOpenEdit}
        />
        <LauncherCard
          title="Manage Presets"
          description="Create and edit reusable customer choice presets for your product categories."
          onClick={onOpenPresets}
        />
      </div>
    </>
  );
}

function LauncherCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border border-driftwood/65 bg-white/85 p-5 text-left transition hover:-translate-y-0.5 hover:border-deep-ocean/35 hover:shadow-sm"
    >
      <span className="block font-serif text-xl text-deep-ocean">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-charcoal/65">{description}</span>
    </button>
  );
}

function ModalShell({
  title,
  subtitle,
  onBack,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-driftwood/60 px-5 py-5 sm:px-7">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 rounded-full border border-driftwood/70 bg-white/80 p-2 text-charcoal/70 transition hover:bg-linen"
            aria-label="Back to Category Tools"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal/70">{subtitle}</p>
          </DialogHeader>
        </div>
        <button type="button" onClick={onClose} className="lux-button--ghost shrink-0 px-4 py-2 text-[10px]">
          Close
        </button>
      </div>
      {children}
    </>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-driftwood/60 bg-white/65 px-5 py-4 sm:px-7">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">{children}</div>
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mx-5 mt-5 rounded-shell border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-7">
      {message}
    </div>
  );
}

function CategoryList({
  categories,
  isLoading,
  isReordering,
  onMove,
  onEdit,
  onDelete,
}: {
  categories: Category[];
  isLoading: boolean;
  isReordering: boolean;
  onMove: (index: number, delta: number) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-[18px] border border-driftwood/60 bg-white/80 px-5 py-5 text-sm text-charcoal/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading categories...
      </div>
    );
  }

  if (categories.length === 0) {
    return <div className="ca-admin-empty-state">No categories yet.</div>;
  }

  return (
    <div className="space-y-3">
      {categories.map((cat, index) => {
        const groups = categoryGroups(cat);
        const shipping =
          typeof cat.shippingCents === 'number' && cat.shippingCents > 0 ? `$${(cat.shippingCents / 100).toFixed(2)}` : '$0.00';
        return (
          <div
            key={cat.id}
            className="rounded-[16px] border border-driftwood/60 bg-white/90 p-4 shadow-[0_10px_30px_rgba(23,56,64,0.04)] transition hover:border-deep-ocean/25 hover:bg-white sm:p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="break-words font-serif text-xl text-deep-ocean">{cat.name || 'Unnamed Category'}</p>
                {cat.subtitle && <p className="mt-1 text-sm leading-6 text-charcoal/65">{cat.subtitle}</p>}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <CategoryStatBadge label="Order" value={index + 1} />
                  <CategoryStatBadge label="Choices" value={groups.length} />
                  <CategoryStatBadge label="Shipping" value={shipping} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => onMove(index, -1)}
                  disabled={index === 0 || isReordering}
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-driftwood/60 bg-linen/55 text-charcoal/65 transition hover:border-deep-ocean/30 hover:bg-white hover:text-deep-ocean disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={`Move ${cat.name} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  disabled={index === categories.length - 1 || isReordering}
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-driftwood/60 bg-linen/55 text-charcoal/65 transition hover:border-deep-ocean/30 hover:bg-white hover:text-deep-ocean disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={`Move ${cat.name} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" className="lux-button--ghost min-h-10 px-4 py-2 text-[10px]" onClick={() => onEdit(cat)}>
                  EDIT
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] text-charcoal/50 transition hover:bg-red-50 hover:text-red-700"
                  onClick={() => onDelete(cat)}
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryStatBadge({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex min-h-[38px] items-center gap-2 rounded-[8px] border border-driftwood/55 bg-linen/55 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/45">{label}</span>
      <span className="text-sm font-semibold text-deep-ocean">{value}</span>
    </span>
  );
}

function PresetList({
  presets,
  onEdit,
  onDelete,
}: {
  presets: VariationPreset[];
  onEdit: (preset: VariationPreset) => void;
  onDelete: (id: string) => void;
}) {
  if (presets.length === 0) {
    return <div className="ca-admin-empty-state">No presets yet.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {presets.map((preset) => (
        <div key={preset.id} className="rounded-[18px] border border-driftwood/60 bg-white/85 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words font-serif text-lg text-deep-ocean">{preset.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-charcoal/55">
                {preset.groups.reduce((total, group) => total + group.options.length, 0)} choice
                {preset.groups.reduce((total, group) => total + group.options.length, 0) === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(preset)}
                className="rounded-full p-2 text-charcoal/55 transition hover:bg-linen hover:text-deep-ocean"
                aria-label={`Edit ${preset.name} preset`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(preset.id)}
                className="rounded-full p-2 text-charcoal/50 transition hover:bg-red-50 hover:text-red-700"
                aria-label={`Delete ${preset.name} preset`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {preset.groups.length > 0 && (
            <p className="mt-3 text-sm leading-6 text-charcoal/65">
              {preset.groups
                .map((group) => {
                  const preview = group.options.map((option) => option.label).filter(Boolean).join(', ');
                  return `${group.label || 'Untitled'}${preview ? `: ${preview}` : ''}`;
                })
                .join(' | ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ApplyTemplateSection({
  presets,
  categories,
  selectedTemplateId,
  selectedCategoryIds,
  isSaving,
  onTemplateChange,
  onCategoryToggle,
  onApply,
}: {
  presets: VariationPreset[];
  categories: Category[];
  selectedTemplateId: string;
  selectedCategoryIds: string[];
  isSaving: boolean;
  onTemplateChange: (id: string) => void;
  onCategoryToggle: (id: string) => void;
  onApply: () => void;
}) {
  return (
    <section className="space-y-4 border-t border-driftwood/60 pt-5">
      <div>
        <p className="ca-admin-heading text-lg">Add Preset to Categories</p>
        <p className="mt-1 text-sm text-charcoal/60">
          Choose a preset and copy it into one or more categories.
        </p>
      </div>
      <div className="rounded-[18px] border border-driftwood/60 bg-white/80 p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)]">
          <div>
            <label className="lux-label mb-2 block">Saved Preset</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => onTemplateChange(e.target.value)}
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
          <div>
            <p className="lux-label mb-2">Choose Categories</p>
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-[14px] border border-driftwood/55 bg-linen/45 p-3">
              {categories.length === 0 ? (
                <p className="text-sm text-charcoal/60">No categories yet.</p>
              ) : (
                categories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-3 rounded-[10px] bg-white/70 px-3 py-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => onCategoryToggle(cat.id)}
                    />
                    <span>{cat.name || 'Unnamed Category'}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-charcoal/55">
          Adding a preset copies its customer choices and price increases into the selected categories. You can edit each category later.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onApply}
            disabled={isSaving || !selectedTemplateId || selectedCategoryIds.length === 0}
            className="lux-button px-5 py-3 text-[10px] disabled:opacity-50"
          >
            {isSaving ? 'Adding...' : 'Add to Categories'}
          </button>
        </div>
      </div>
    </section>
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

function ShippingInput({
  value,
  onChange,
  sanitize,
  formatDisplay,
  formatValue,
}: {
  value: string;
  onChange: (value: string) => void;
  sanitize: (value: string) => string;
  formatDisplay: (value: string) => string;
  formatValue: (value: string) => string;
}) {
  return (
    <div className="w-full sm:max-w-[240px]">
      <label className="lux-label mb-2 block">Shipping</label>
      <input
        type="text"
        inputMode="decimal"
        value={formatDisplay(value)}
        onChange={(e) => onChange(sanitize(e.target.value))}
        onBlur={(e) => onChange(formatValue(e.target.value))}
        placeholder="$0.00"
        className="lux-input min-h-[46px] text-base"
      />
    </div>
  );
}

function sanitizeMoneyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)}`;
}

function formatMoneyDisplay(value: string): string {
  const sanitized = sanitizeMoneyInput(value);
  return sanitized ? `$${sanitized}` : '';
}

function centsToMoneyInput(cents?: number | null): string {
  const value = Number(cents || 0);
  return Number.isFinite(value) && value > 0 ? (Math.round(value) / 100).toFixed(2) : '';
}

function moneyInputToCents(value: string): number {
  const sanitized = sanitizeMoneyInput(value);
  if (!sanitized) return 0;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

const choicePlaceholders = ['Blue', 'Clam Shell', 'Set of 6'];

const getChoicePlaceholder = (index: number) => choicePlaceholders[index] ?? 'Gold';

function PriceIncreaseInput({
  valueCents,
  onChange,
}: {
  valueCents?: number | null;
  onChange: (cents: number) => void;
}) {
  const [value, setValue] = useState(() => centsToMoneyInput(valueCents));

  useEffect(() => {
    setValue(centsToMoneyInput(valueCents));
  }, [valueCents]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={formatMoneyDisplay(value)}
      onChange={(e) => {
        const next = sanitizeMoneyInput(e.target.value);
        setValue(next);
        onChange(moneyInputToCents(next));
      }}
      onBlur={(e) => {
        const cents = moneyInputToCents(e.target.value);
        setValue(centsToMoneyInput(cents));
        onChange(cents);
      }}
      placeholder="$0.00"
      className="lux-input min-h-[44px] text-base"
    />
  );
}

const groupToChoiceBuilderDraft = (group: VariationGroup): ChoiceBuilderDraft => ({
  id: group.id,
  label: group.label || '',
  required: group.required !== false,
  choices: group.options.length
    ? group.options.map((option) => ({
        id: option.id || crypto.randomUUID(),
        label: option.label || '',
        priceIncreaseCents: option.priceIncreaseCents || 0,
      }))
    : [{ id: crypto.randomUUID(), label: '', priceIncreaseCents: 0 }],
});

function ChoiceBuilder({
  draft,
  onDraftChange,
}: {
  draft: ChoiceBuilderDraft;
  onDraftChange: (draft: ChoiceBuilderDraft) => void;
}) {
  const updateChoice = (id: string, patch: Partial<ChoiceValueDraft>) => {
    onDraftChange({
      ...draft,
      choices: draft.choices.map((choice) => (choice.id === id ? { ...choice, ...patch } : choice)),
    });
  };

  return (
    <div className="rounded-[20px] border border-deep-ocean/25 bg-white p-4 sm:p-5">
      <div className="space-y-4 border-l-2 border-driftwood/70 pl-4 sm:pl-5">
        <div>
          <label className="lux-label mb-2 block">Choice Name</label>
          <input
            value={draft.label}
            onChange={(e) => onDraftChange({ ...draft, label: e.target.value })}
            placeholder="Trim, Shell Type, Set Size"
            className="lux-input min-h-[46px] text-base"
          />
        </div>

        <label className="flex items-center gap-3 rounded-[14px] border border-driftwood/60 bg-linen/55 px-4 py-3 text-xs uppercase tracking-[0.2em] text-charcoal/70">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => onDraftChange({ ...draft, required: e.target.checked })}
          />
          Customer must choose one
        </label>

        <div className="space-y-3 pl-3 sm:pl-5">
          <div>
            <p className="lux-label">Choices</p>
            <p className="mt-1 text-xs leading-5 text-charcoal/55">
              Price Increase is added to the base product price. Leave at $0 if this choice does not change the price.
            </p>
          </div>
          {draft.choices.map((choice, index) => (
            <div key={choice.id} className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_minmax(170px,220px)_auto]">
              <input
                value={choice.label}
                onChange={(e) => updateChoice(choice.id, { label: e.target.value })}
                placeholder={getChoicePlaceholder(index)}
                className="lux-input min-h-[44px] text-base"
              />
              <div>
                <label className="sr-only">Price Increase</label>
                <PriceIncreaseInput
                  valueCents={choice.priceIncreaseCents}
                  onChange={(cents) => updateChoice(choice.id, { priceIncreaseCents: cents })}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    choices: draft.choices.filter((item) => item.id !== choice.id),
                  })
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
              onDraftChange({
                ...draft,
                choices: [...draft.choices, { id: crypto.randomUUID(), label: '', priceIncreaseCents: 0 }],
              })
            }
            className="lux-button--ghost px-4 py-2 text-[10px]"
          >
            Add Another Choice
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateCategoryChoicesEditor({
  groups,
  presets,
  builderDraft,
  showPresets,
  onTogglePresets,
  onBuilderDraftChange,
  onUsePreset,
  onEditPreset,
  onAddBuilderChoice,
  onAddBuilderAsPreset,
  onEditGroup,
  onGroupsChange,
}: {
  groups: VariationGroup[];
  presets: VariationPreset[];
  builderDraft: ChoiceBuilderDraft;
  showPresets: boolean;
  onTogglePresets: () => void;
  onBuilderDraftChange: (draft: ChoiceBuilderDraft) => void;
  onUsePreset: (preset: VariationPreset) => void;
  onEditPreset: (preset: VariationPreset) => void;
  onAddBuilderChoice: () => boolean;
  onAddBuilderAsPreset: () => void;
  onEditGroup: (group: VariationGroup) => void;
  onGroupsChange: (groups: VariationGroup[]) => void;
}) {
  return (
    <section className="space-y-5 rounded-[22px] border border-driftwood/65 bg-linen/45 p-4 sm:p-5">
      <div>
        <p className="ca-admin-heading text-lg">Customer Choices</p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-charcoal/65">
          Add the choices customers will pick from on products in this category, like Trim, Shell Type, or Set Size.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="ca-admin-heading text-lg">New Customer Choice</p>
          <p className="mt-1 text-sm text-charcoal/60">
            Create a choice customers can select on products in this category.
          </p>
        </div>
        <ChoiceBuilder draft={builderDraft} onDraftChange={onBuilderDraftChange} />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onAddBuilderChoice} className="lux-button px-5 py-3 text-[10px]">
              Add to Category
            </button>
            <button
              type="button"
              onClick={onAddBuilderAsPreset}
              className="lux-button--ghost px-5 py-3 text-[10px]"
            >
              Add As New Preset
            </button>
          </div>
      </div>

      <PresetBrowser
        presets={presets}
        expanded={showPresets}
        onToggle={onTogglePresets}
        onUsePreset={onUsePreset}
        onEditPreset={onEditPreset}
      />

      <CurrentCategoryChoices
        groups={groups}
        onEditGroup={onEditGroup}
        onRemoveGroup={(groupId) => onGroupsChange(groups.filter((group) => group.id !== groupId))}
      />
    </section>
  );
}

function PresetBrowser({
  presets,
  expanded,
  onToggle,
  onUsePreset,
  onEditPreset,
}: {
  presets: VariationPreset[];
  expanded: boolean;
  onToggle: () => void;
  onUsePreset: (preset: VariationPreset) => void;
  onEditPreset: (preset: VariationPreset) => void;
}) {
  return (
    <section className="rounded-[18px] border border-driftwood/60 bg-white/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <span>
          <span className="ca-admin-heading block text-base">Use Existing Presets</span>
          <span className="mt-1 block text-sm text-charcoal/60">Browse saved presets and add them to this category.</span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean">
          {expanded ? 'Hide' : 'Browse'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-driftwood/55 px-4 py-4">
          {presets.length === 0 ? (
            <div className="ca-admin-empty-state">
              No presets saved yet. Create a customer choice above and click Add As New Preset to reuse it later.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {presets.map((preset) => (
                <PresetChoiceCard
                  key={preset.id}
                  preset={preset}
                  onUse={() => onUsePreset(preset)}
                  onEdit={() => onEditPreset(preset)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PresetChoiceCard({
  preset,
  onUse,
  onEdit,
}: {
  preset: VariationPreset;
  onUse: () => void;
  onEdit: () => void;
}) {
  const groups = normalizeVariationGroups(preset.groups);
  const requiredLabels = new Set(groups.map((group) => (group.required !== false ? 'YES' : 'NO')));
  const requiredText = requiredLabels.size === 1 ? Array.from(requiredLabels)[0] : 'MIXED';

  return (
    <div className="rounded-[18px] border border-driftwood/65 bg-white/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl text-deep-ocean">{preset.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-charcoal/55">
            Customer must choose: {requiredText}
          </p>
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="mt-4 space-y-3">
          {groups.map((group) => (
            <div key={group.id || group.label}>
              {groups.length > 1 && <p className="lux-label mb-1">{group.label}</p>}
              <ul className="space-y-1 text-sm text-charcoal/70">
                {group.options.map((option) => (
                  <li key={option.id || option.value || option.label}>
                    - {option.label}
                    {option.priceIncreaseCents && option.priceIncreaseCents > 0
                      ? ` +$${(option.priceIncreaseCents / 100).toFixed(2).replace(/\.00$/, '')}`
                      : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-charcoal/55">No choices saved in this preset.</p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onEdit} className="lux-button--ghost px-4 py-2 text-[10px]">
          Edit Preset
        </button>
        <button type="button" onClick={onUse} className="lux-button px-4 py-2 text-[10px]">
          Use Preset
        </button>
      </div>
    </div>
  );
}

function EditCategoryChoicesEditor({
  groups,
  presets,
  selectedPresetId,
  builderDraft,
  editingGroupId,
  onSelectedPresetChange,
  onBuilderDraftChange,
  onUsePreset,
  onAddBuilderChoice,
  onAddBuilderAsPreset,
  onCancelChoiceEdit,
  onEditGroup,
  onGroupsChange,
}: {
  groups: VariationGroup[];
  presets: VariationPreset[];
  selectedPresetId: string;
  builderDraft: ChoiceBuilderDraft;
  editingGroupId: string | null;
  onSelectedPresetChange: (id: string) => void;
  onBuilderDraftChange: (draft: ChoiceBuilderDraft) => void;
  onUsePreset: () => void;
  onAddBuilderChoice: () => boolean;
  onAddBuilderAsPreset: () => void;
  onCancelChoiceEdit: () => void;
  onEditGroup: (group: VariationGroup) => void;
  onGroupsChange: (groups: VariationGroup[]) => void;
}) {
  return (
    <section className="space-y-5 rounded-[22px] border border-driftwood/65 bg-linen/45 p-4 sm:p-5">
      <CurrentCategoryChoices
        groups={groups}
        helperText="These are the dropdown choices customers will see on products in this category."
        emptyText="No customer choices are currently attached to this category."
        withTopBorder={false}
        onEditGroup={onEditGroup}
        onRemoveGroup={(groupId) => onGroupsChange(groups.filter((group) => group.id !== groupId))}
      />

      <div className="rounded-[18px] border border-driftwood/60 bg-white/80 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(190px,0.55fr)_minmax(260px,1fr)_auto] lg:items-end">
          <div className="lg:pb-1">
            <p className="ca-admin-heading text-base">Use Preset</p>
            <p className="mt-1 text-sm text-charcoal/60">Choose a saved preset and add it to this category.</p>
          </div>
          <div>
            <label className="lux-label mb-2 block">Saved Preset</label>
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
            onClick={onUsePreset}
            className="lux-button--ghost px-5 py-3 text-[10px] disabled:opacity-50"
          >
            Add Preset to Category
          </button>
        </div>
      </div>

      <div className="space-y-4 border-t border-driftwood/60 pt-5">
        <div>
          <p className="ca-admin-heading text-lg">{editingGroupId ? 'Edit Choice' : 'Add New Choice'}</p>
          <p className="mt-1 text-sm text-charcoal/60">
            Choice Name is the dropdown label customers will see. Choices are the dropdown values.
          </p>
        </div>
        <ChoiceBuilder draft={builderDraft} onDraftChange={onBuilderDraftChange} />
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {editingGroupId && (
            <button type="button" onClick={onCancelChoiceEdit} className="lux-button--ghost px-5 py-3 text-[10px]">
              Cancel Choice Edit
            </button>
          )}
          <button type="button" onClick={onAddBuilderChoice} className="lux-button px-5 py-3 text-[10px]">
            {editingGroupId ? 'Update Choice' : 'Add to Category'}
          </button>
          {!editingGroupId && (
            <button
              type="button"
              onClick={onAddBuilderAsPreset}
              className="lux-button--ghost px-5 py-3 text-[10px]"
            >
              Add As New Preset
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function CurrentCategoryChoices({
  groups,
  helperText = 'These choices will be attached when you create the category.',
  emptyText = 'No customer choices added yet. Products in this category will not show dropdown choices unless added later.',
  withTopBorder = true,
  onEditGroup,
  onRemoveGroup,
}: {
  groups: VariationGroup[];
  helperText?: string;
  emptyText?: string;
  withTopBorder?: boolean;
  onEditGroup: (group: VariationGroup) => void;
  onRemoveGroup: (groupId: string) => void;
}) {
  return (
    <section className={`space-y-4 ${withTopBorder ? 'border-t border-driftwood/60 pt-5' : ''}`}>
      <div>
        <p className="ca-admin-heading text-lg">Current Choices for This Category</p>
        <p className="mt-1 text-sm text-charcoal/60">{helperText}</p>
      </div>

      {groups.length === 0 ? (
        <div className="ca-admin-empty-state">{emptyText}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.id} className="rounded-[18px] border border-driftwood/65 bg-white/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-xl text-deep-ocean">{group.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-charcoal/55">
                    Customer must choose: {group.required !== false ? 'Yes' : 'No'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => onEditGroup(group)} className="lux-button--ghost px-3 py-2 text-[10px]">
                    Edit
                  </button>
                  <button type="button" onClick={() => onRemoveGroup(group.id)} className="lux-button--ghost px-3 py-2 text-[10px] text-red-700">
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <p className="lux-label mb-2">Choices</p>
                <ul className="space-y-1 text-sm text-charcoal/70">
                  {group.options.map((option) => (
                    <li key={option.id}>
                      - {option.label}
                      {option.priceIncreaseCents && option.priceIncreaseCents > 0
                        ? ` +$${(option.priceIncreaseCents / 100).toFixed(2).replace(/\.00$/, '')}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
