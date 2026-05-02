import type { Category, SelectedVariationOption, VariationGroup, VariationOption } from './types';

export const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const slugifyOptionValue = (value: string) => normalizeCategoryKey(value);

export type CategoryOptionGroup = VariationGroup;

const normalizeOptionList = (items: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  items.forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });
  return normalized;
};

export const createVariationOption = (label: string, index = 0): VariationOption => ({
  id: crypto.randomUUID(),
  label: label.trim(),
  value: slugifyOptionValue(label),
  priceIncreaseCents: 0,
  displayOrder: index,
  enabled: true,
});

export const createVariationGroup = (label = '', options: string[] = []): VariationGroup => ({
  id: crypto.randomUUID(),
  label,
  inputType: 'select',
  required: true,
  displayOrder: 0,
  enabled: true,
  options: normalizeOptionList(options).map((option, index) => createVariationOption(option, index)),
});

export const normalizeVariationGroups = (groups: VariationGroup[] | undefined | null): VariationGroup[] => {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group, groupIndex) => {
      const label = (group.label || '').trim();
      const seen = new Set<string>();
      const options = (Array.isArray(group.options) ? group.options : [])
        .map((option, optionIndex) => {
          const optionLabel = (option.label || '').trim();
          if (!optionLabel) return null;
          const value = (option.value || slugifyOptionValue(optionLabel)).trim();
          const key = value.toLowerCase();
          if (seen.has(key)) return null;
          seen.add(key);
          return {
            id: option.id || crypto.randomUUID(),
            label: optionLabel,
            value,
            priceIncreaseCents:
              Number.isFinite((option as VariationOption).priceIncreaseCents as number) &&
              ((option as VariationOption).priceIncreaseCents as number) > 0
                ? Math.round((option as VariationOption).priceIncreaseCents as number)
                : 0,
            displayOrder: option.displayOrder ?? optionIndex,
            enabled: option.enabled !== false,
          } satisfies VariationOption;
        })
        .filter((option): option is VariationOption => Boolean(option))
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

      if (!label || options.length === 0) return null;
      return {
        id: group.id || crypto.randomUUID(),
        label,
        inputType: 'select',
        required: group.required !== false,
        displayOrder: group.displayOrder ?? groupIndex,
        enabled: group.enabled !== false,
        presetId: group.presetId ?? null,
        options,
      } satisfies VariationGroup;
    })
    .filter((group): group is VariationGroup => Boolean(group))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
};

export const groupsFromLegacyOption = (
  label?: string | null,
  options?: string[] | null
): VariationGroup[] => {
  const cleanLabel = (label || '').trim();
  const cleanOptions = normalizeOptionList(options || []);
  return cleanLabel && cleanOptions.length ? [createVariationGroup(cleanLabel, cleanOptions)] : [];
};

export const getCategoryVariationGroups = (category?: Category | null): VariationGroup[] => {
  const groups = normalizeVariationGroups(category?.optionGroups);
  if (groups.length) return groups;
  return groupsFromLegacyOption(category?.optionGroupLabel, category?.optionGroupOptions);
};

export const buildCategoryOptionLookup = (categories: Category[]) => {
  const map = new Map<string, VariationGroup[]>();
  categories.forEach((cat) => {
    const groups = getCategoryVariationGroups(cat);
    if (!groups.length) return;
    const slugKey = cat.slug ? normalizeCategoryKey(cat.slug) : '';
    const nameKey = cat.name ? normalizeCategoryKey(cat.name) : '';
    [slugKey, nameKey].filter(Boolean).forEach((key) => {
      if (!map.has(key)) map.set(key, groups);
    });
  });
  return map;
};

export const resolveCategoryOptionGroups = (
  categoryValue: string | null | undefined,
  lookup: Map<string, VariationGroup[]>
) => {
  const key = categoryValue ? normalizeCategoryKey(categoryValue) : '';
  return key ? lookup.get(key) || [] : [];
};

export const resolveCategoryOptionGroup = (
  categoryValue: string | null | undefined,
  lookup: Map<string, VariationGroup[]>
) => resolveCategoryOptionGroups(categoryValue, lookup)[0] || null;

export const flattenSelectedOptionsLabel = (selectedOptions?: SelectedVariationOption[] | null) => {
  const options = Array.isArray(selectedOptions) ? selectedOptions : [];
  return options.map((option) => `${option.groupLabel}: ${option.optionLabel}`).join(', ');
};

export const selectedOptionsPriceIncreaseCents = (selectedOptions?: SelectedVariationOption[] | null) => {
  const options = Array.isArray(selectedOptions) ? selectedOptions : [];
  return options.reduce((total, option) => {
    const cents = Number(option.priceIncreaseCents || 0);
    return total + (Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0);
  }, 0);
};

export const formatChoiceLabel = (label: string, priceIncreaseCents?: number | null) => {
  const cents = Number(priceIncreaseCents || 0);
  if (!Number.isFinite(cents) || cents <= 0) return label;
  return `${label} +$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, '')}`;
};
