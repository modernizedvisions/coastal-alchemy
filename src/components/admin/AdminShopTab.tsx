import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle, GripVertical, Loader2, Trash2 } from 'lucide-react';
import type { Category, Product } from '../../lib/types';
import type { ManagedImage, ProductFormState } from '../../pages/AdminPage';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminFetchCategories } from '../../lib/adminApi';
import { AdminSectionHeader } from './AdminSectionHeader';
import { CategoryManagementModal } from './CategoryManagementModal';
import { ProductVideoField } from './ProductVideoField';
import { ProgressiveImage } from '../ui/ProgressiveImage';
import { buildOptimizedImageSrc } from '../../lib/imageOptimize';

interface ProductAdminCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

interface SortableAdminProductTileProps {
  product: Product;
  canReorder: boolean;
  isReordering: boolean;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => Promise<void> | void;
}

interface SortableEditImageTileProps {
  image: ManagedImage;
  index: number;
  canReorder: boolean;
  onSetPrimary: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

type AdminProductSortMode =
  | 'storefront'
  | 'newest'
  | 'oldest'
  | 'price_desc'
  | 'price_asc';

const ADMIN_PRODUCT_SORT_OPTIONS: Array<{ value: AdminProductSortMode; label: string }> = [
  { value: 'storefront', label: 'Current Order' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
];

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();
  const ordered: Category[] = [];

  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key || map.has(key)) return;
    const normalized: Category = {
      ...cat,
      id: cat.id || key,
    };
    map.set(key, normalized);
    ordered.push(normalized);
  });

  return ordered;
};

const ProductAdminCard: React.FC<ProductAdminCardProps> = ({ product, onEdit, onDelete }) => {
  const rawSrc = Array.isArray((product as any).images) && (product as any).images.length > 0
    ? (product as any).images[0]
    : (product as any).imageUrls?.[0] ?? (product as any).imageUrl ?? null;
  const { primarySrc, fallbackSrc } = buildOptimizedImageSrc(rawSrc || '', 'thumb');
  const categoryLabel =
    (product as any).category ||
    product.type ||
    ((product as any).categories && Array.isArray((product as any).categories) ? (product as any).categories[0] : null);

  const isActive = ('active' in product ? (product as any).active : (product as any).active) ?? product.visible;

  const priceLabel =
    (product as any).formattedPrice ??
    (product as any).priceFormatted ??
    (product as any).displayPrice ??
    (product as any).price ??
    (product.priceCents !== undefined ? formatPriceDisplay(product.priceCents) : '');

  return (
    <div className="group lux-card relative overflow-hidden bg-white/90 transition-all duration-300 hover:-translate-y-0.5">
      <div className="relative aspect-square overflow-hidden rounded-shell-lg bg-sand">
        {isActive !== undefined && (
          <span
            className={`absolute left-3 top-3 z-10 lux-pill border ${
              isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (!product.id) return;
              onDelete(product.id);
            }}
            className="absolute right-3 top-3 z-10 rounded-ui border border-rose-200 bg-white/95 px-2 py-1 text-rose-700 transition hover:bg-rose-50"
            aria-label={`Delete ${product.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {rawSrc ? (
          <ProgressiveImage
            src={primarySrc}
            fallbackSrc={fallbackSrc}
            timeoutMs={2500}
            alt={product.name}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            width={640}
            height={640}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-charcoal/50">
            No image
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-charcoal/60 truncate">
          {categoryLabel || 'Uncategorized'}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
          <h3 className="text-base font-serif font-semibold text-deep-ocean truncate sm:whitespace-normal sm:overflow-visible sm:text-ellipsis">
            {product.name}
          </h3>
          <span className="text-lg font-serif font-semibold text-deep-ocean whitespace-nowrap">
            {priceLabel}
          </span>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            className="lux-button--ghost w-full justify-center flex-1 min-w-0 px-3 sm:px-5"
            onClick={() => onEdit(product)}
          >
            Edit Product
          </button>
        </div>
      </div>
    </div>
  );
};

const SortableAdminProductTile: React.FC<SortableAdminProductTileProps> = ({
  product,
  canReorder,
  isReordering,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: product.id,
    disabled: !canReorder,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative touch-pan-y ${
        isOver ? 'rounded-shell-xl ring-2 ring-deep-ocean/30' : ''
      } ${isDragging || isReordering ? 'opacity-80' : ''}`}
    >
      {canReorder && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 z-20 rounded-ui border border-driftwood/55 bg-white/95 p-1.5 text-charcoal/60 cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Reorder ${product.name}`}
          title="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}
      <ProductAdminCard product={product} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
};

const SortableEditImageTile: React.FC<SortableEditImageTileProps> = ({
  image,
  index,
  canReorder,
  onSetPrimary,
  onRetry,
  onRemove,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: image.id,
    disabled: !canReorder,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-square rounded-shell-lg overflow-hidden border border-driftwood/60 bg-linen/80 touch-pan-y ${
        isDragging ? 'opacity-70' : ''
      } ${isOver ? 'ring-2 ring-deep-ocean/35' : ''}`}
    >
      {canReorder && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 z-20 rounded-ui border border-driftwood/55 bg-white/95 p-1 text-charcoal/60 cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Reorder image ${index + 1}`}
          title="Drag to reorder image"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <ProgressiveImage
        src={image.previewUrl ?? image.url}
        alt={`Edit image ${index + 1}`}
        className="h-full w-full"
        imgClassName="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      {(image.uploading || image.optimizing) && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/70">
          {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
        </div>
      )}
      {image.uploadError && (
        <div className="absolute inset-x-0 top-0 bg-red-600/90 text-white text-[10px] px-2 py-1">
          {image.uploadError}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-2 py-1 text-xs text-white">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetPrimary(image.id);
          }}
          className={`px-2 py-1 rounded-shell ${image.isPrimary ? 'bg-white text-charcoal' : 'bg-black/30 text-white'}`}
        >
          {image.isPrimary ? 'Primary' : 'Set primary'}
        </button>
        {image.uploadError && image.file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(image.id);
            }}
            className="text-sky-100 hover:text-sky-300"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(image.id);
          }}
          className="text-red-100 hover:text-red-300"
        >
          Remove
        </button>
      </div>
      <div className="absolute right-2 top-2 rounded-ui bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-charcoal/80 shadow-sm">
        #{index + 1}
      </div>
    </div>
  );
};

export interface AdminShopTabProps {
  productStatus: { type: 'success' | 'error' | null; message: string };
  productForm: ProductFormState;
  productImages: ManagedImage[];
  editProductImages: ManagedImage[];
  adminProducts: Product[];
  editProductId: string | null;
  editProductForm: ProductFormState | null;
  productSaveState: 'idle' | 'saving' | 'success' | 'error';
  editProductSaveState: 'idle' | 'saving' | 'success' | 'error';
  isLoadingProducts: boolean;
  productImageFileInputRef: React.RefObject<HTMLInputElement>;
  editProductImageFileInputRef: React.RefObject<HTMLInputElement>;
  onCreateProduct: (e: React.FormEvent) => Product | null | void | Promise<Product | null | void>;
  onProductFormChange: (field: keyof ProductFormState, value: string | number | boolean) => void;
  onResetProductForm: () => void;
  onAddProductImages: (files: File[], slotIndex?: number) => void;
  onSetPrimaryProductImage: (id: string) => void;
  onRemoveProductImage: (id: string) => void;
  onRetryProductImage: (id: string) => void;
  onAddEditProductImages: (files: File[], slotIndex?: number) => void;
  onSetPrimaryEditImage: (id: string) => void;
  onMoveEditImage: (id: string, direction: 'up' | 'down') => void;
  onReorderEditImages?: (orderedIds: string[]) => void;
  onRemoveEditImage: (id: string) => void;
  onRetryEditImage: (id: string) => void;
  onEditFormChange: (field: keyof ProductFormState, value: string | number | boolean) => void;
  onUpdateProduct: (e: React.FormEvent) => Promise<boolean | void>;
  onCancelEditProduct: () => void;
  onStartEditProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void | Promise<void>;
  onReorderProducts?: (orderedIds: string[]) => void | Promise<void>;
  onRefreshProducts?: () => void | Promise<void>;
}

export const AdminShopTab: React.FC<AdminShopTabProps> = ({
  productStatus,
  productForm,
  productImages,
  editProductImages,
  adminProducts,
  editProductId,
  editProductForm,
  productSaveState,
  editProductSaveState,
  isLoadingProducts,
  productImageFileInputRef,
  editProductImageFileInputRef,
  onCreateProduct,
  onProductFormChange,
  onResetProductForm,
  onAddProductImages,
  onSetPrimaryProductImage,
  onRemoveProductImage,
  onRetryProductImage,
  onAddEditProductImages,
  onSetPrimaryEditImage,
  onMoveEditImage,
  onReorderEditImages,
  onRemoveEditImage,
  onRetryEditImage,
  onEditFormChange,
  onUpdateProduct,
  onCancelEditProduct,
  onStartEditProduct,
  onDeleteProduct,
  onReorderProducts,
  onRefreshProducts,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortMode, setSortMode] = useState<AdminProductSortMode>('newest');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editImages, setEditImages] = useState<ManagedImage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [autoDescriptionEnabled, setAutoDescriptionEnabled] = useState(true);
  const [lastAutoDescription, setLastAutoDescription] = useState('');
  const [editAutoDescriptionEnabled, setEditAutoDescriptionEnabled] = useState(false);
  const [lastEditAutoDescription, setLastEditAutoDescription] = useState('');
  const [activeDragProductId, setActiveDragProductId] = useState<string | null>(null);
  const [activeEditImageId, setActiveEditImageId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [pendingCreateVideoFile, setPendingCreateVideoFile] = useState<File | null>(null);
  const [createVideoUploadTargetProductId, setCreateVideoUploadTargetProductId] = useState<string | null>(null);
  const [createVideoFlowMessage, setCreateVideoFlowMessage] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;
  const hasCategories = categories.length > 0;
  const isCreateVideoUploadInFlight = !!createVideoUploadTargetProductId;
  const maxModalImages = 4;
  const isOptimizing = productImages.some((img) => img?.optimizing);
  const isUploading = productImages.some((img) => img?.uploading);
  const missingUrlCount = productImages.filter(
    (img) =>
      img &&
      !img.uploading &&
      !img.uploadError &&
      (!!img.file ||
        !!img.previewUrl ||
        img.url?.startsWith('blob:') ||
        img.url?.startsWith('data:'))
  ).length;
  const failedCount = productImages.filter((img) => img?.uploadError).length;
  const createSelectedCategory = useMemo(
    () => categories.find((cat) => (cat.name || '') === productForm.category) || null,
    [categories, productForm.category]
  );
  const editSelectedCategory = useMemo(
    () =>
      categories.find((cat) => (cat.name || '') === (editProductForm?.category || '')) || null,
    [categories, editProductForm?.category]
  );
  const createOverrideAmountInvalid =
    !!productForm.shippingOverrideEnabled &&
    parseCurrencyToCents(productForm.shippingOverrideAmount) === null;
  const editOverrideAmountInvalid =
    !!editProductForm?.shippingOverrideEnabled &&
    parseCurrencyToCents(editProductForm.shippingOverrideAmount) === null;
  const createShippingDisplayValue = useMemo(() => {
    const formattedOverride = formatCurrencyDisplay(productForm.shippingOverrideAmount || '');
    const parsedOverride = parseCurrencyToCents(productForm.shippingOverrideAmount);
    if (productForm.shippingOverrideEnabled) {
      return formattedOverride;
    }
    if (parsedOverride !== null) {
      return formattedOverride;
    }
    return formatPriceDisplay(createSelectedCategory?.shippingCents ?? 0);
  }, [
    createSelectedCategory?.shippingCents,
    productForm.shippingOverrideAmount,
    productForm.shippingOverrideEnabled,
  ]);
  const editShippingDisplayValue = useMemo(() => {
    if (!editProductForm) return '';
    const formattedOverride = formatCurrencyDisplay(editProductForm.shippingOverrideAmount || '');
    const parsedOverride = parseCurrencyToCents(editProductForm.shippingOverrideAmount);
    if (editProductForm.shippingOverrideEnabled) {
      return formattedOverride;
    }
    if (parsedOverride !== null) {
      return formattedOverride;
    }
    return formatPriceDisplay(editSelectedCategory?.shippingCents ?? 0);
  }, [
    editProductForm,
    editProductForm?.shippingOverrideAmount,
    editProductForm?.shippingOverrideEnabled,
    editSelectedCategory?.shippingCents,
  ]);
  const activeEditProduct = useMemo(
    () => adminProducts.find((product) => product.id === editProductId) || null,
    [adminProducts, editProductId]
  );

  const createCategorySampleDescription = (createSelectedCategory?.sampleDescription || '').trim();
  const editCategorySampleDescription = (editSelectedCategory?.sampleDescription || '').trim();

  const addProductStatusMessages = useMemo(() => {
    const messages: string[] = [];
    if (isOptimizing) messages.push('Optimizing images...');
    if (!isOptimizing && isUploading) messages.push('Uploading images...');
    if (!isUploading && failedCount > 0) messages.push('Fix failed uploads (remove/retry) before saving.');
    if (!isUploading && missingUrlCount > 0) {
      messages.push('Some images did not finish uploading. Retry or remove.');
    }
    if (createOverrideAmountInvalid) {
      messages.push('Enter a valid override shipping amount (0 or more).');
    }
    if (!hasCategories) {
      messages.push('Create at least one category before saving a product.');
    }
    if (createVideoFlowMessage) {
      messages.push(createVideoFlowMessage);
    }
    return messages;
  }, [
    createVideoFlowMessage,
    createOverrideAmountInvalid,
    failedCount,
    hasCategories,
    isOptimizing,
    isUploading,
    missingUrlCount,
  ]);

  useEffect(() => {
    if (!isDev) return;
    console.debug('[shop save] disable check', {
      isUploading,
      uploadingCount: productImages.filter((img) => img?.uploading).length,
      missingUrlCount,
      failedCount,
      imageCount: productImages.length,
    });
  }, [failedCount, isDev, isUploading, missingUrlCount, productImages]);

  const normalizeCategory = (value: string | undefined | null) => (value || '').trim().toLowerCase();
  const isProductSoldOrOut = (product: Product) => {
    const isSoldFlag =
      (product as any).isSold === true ||
      (product as any).is_sold === 1;
    const quantity = (product as any).quantityAvailable ?? (product as any).quantity_available;
    const soldOutByQuantity = typeof quantity === 'number' && quantity <= 0;
    return isSoldFlag || soldOutByQuantity;
  };
  const getProductCategories = (product: Product): string[] => {
    const names = new Set<string>();
    const add = (name?: string | null) => {
      const trimmed = (name || '').trim();
      if (trimmed) names.add(trimmed);
    };
    add((product as any).category);
    add(product.type);
    if (Array.isArray((product as any).categories)) {
      (product as any).categories.forEach((c: unknown) => {
        if (typeof c === 'string') add(c);
      });
    }
    return Array.from(names);
  };

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const apiCategories = await adminFetchCategories();
        const normalized = normalizeCategoriesList(apiCategories);
        if (cancelled) return;
        setCategories(normalized);
      } catch (error) {
        console.error('Failed to load categories', error);
      } finally {
      }
    };
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const names = categories.map((c) => c.name).filter(Boolean);
    const firstAvailable = names[0] || '';

    if (names.length === 0) {
      if (productForm.category) onProductFormChange('category', '');
      if (editProductForm?.category) onEditFormChange('category', '');
      if (selectedCategory !== 'All') setSelectedCategory('All');
      return;
    }

    if (!productForm.category || !names.includes(productForm.category)) {
      onProductFormChange('category', firstAvailable);
    }

    if (editProductForm && (!editProductForm.category || !names.includes(editProductForm.category))) {
      onEditFormChange('category', firstAvailable);
    }

    if (selectedCategory !== 'All' && !names.includes(selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [categories, editProductForm, onEditFormChange, onProductFormChange, productForm.category, selectedCategory]);

  useEffect(() => {
    if (!autoDescriptionEnabled) return;
    const currentDescription = productForm.description || '';
    if (!createCategorySampleDescription) {
      if (lastAutoDescription && currentDescription === lastAutoDescription) {
        onProductFormChange('description', '');
        setLastAutoDescription('');
      }
      return;
    }
    if (!currentDescription.trim() || currentDescription === lastAutoDescription) {
      if (currentDescription !== createCategorySampleDescription) {
        onProductFormChange('description', createCategorySampleDescription);
      }
      if (lastAutoDescription !== createCategorySampleDescription) {
        setLastAutoDescription(createCategorySampleDescription);
      }
    }
  }, [
    autoDescriptionEnabled,
    createCategorySampleDescription,
    lastAutoDescription,
    onProductFormChange,
    productForm.description,
  ]);

  useEffect(() => {
    if (!editAutoDescriptionEnabled || !editProductForm) return;
    const currentDescription = editProductForm.description || '';
    if (!editCategorySampleDescription) {
      if (lastEditAutoDescription && currentDescription === lastEditAutoDescription) {
        onEditFormChange('description', '');
        setLastEditAutoDescription('');
      }
      return;
    }
    if (!currentDescription.trim() || currentDescription === lastEditAutoDescription) {
      if (currentDescription !== editCategorySampleDescription) {
        onEditFormChange('description', editCategorySampleDescription);
      }
      if (lastEditAutoDescription !== editCategorySampleDescription) {
        setLastEditAutoDescription(editCategorySampleDescription);
      }
    }
  }, [
    editAutoDescriptionEnabled,
    editCategorySampleDescription,
    editProductForm,
    editProductForm?.description,
    lastEditAutoDescription,
    onEditFormChange,
  ]);

  const handleCreateAutoDescriptionToggle = (enabled: boolean) => {
    setAutoDescriptionEnabled(enabled);
    const currentDescription = productForm.description || '';
    if (!enabled) {
      if (lastAutoDescription && currentDescription === lastAutoDescription) {
        onProductFormChange('description', '');
        setLastAutoDescription('');
      }
      return;
    }
    if (createCategorySampleDescription && (!currentDescription.trim() || currentDescription === lastAutoDescription)) {
      onProductFormChange('description', createCategorySampleDescription);
      setLastAutoDescription(createCategorySampleDescription);
    }
  };

  const handleEditAutoDescriptionToggle = (enabled: boolean) => {
    setEditAutoDescriptionEnabled(enabled);
    if (!editProductForm) return;
    const currentDescription = editProductForm.description || '';
    if (!enabled) {
      if (lastEditAutoDescription && currentDescription === lastEditAutoDescription) {
        onEditFormChange('description', '');
        setLastEditAutoDescription('');
      }
      return;
    }
    if (editCategorySampleDescription && (!currentDescription.trim() || currentDescription === lastEditAutoDescription)) {
      onEditFormChange('description', editCategorySampleDescription);
      setLastEditAutoDescription(editCategorySampleDescription);
    }
  };

  const handleStartEditProduct = (product: Product) => {
    setEditAutoDescriptionEnabled(false);
    setLastEditAutoDescription('');
    setIsEditModalOpen(true);
    onStartEditProduct(product);
  };

  const handleModalFileSelect = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    onAddEditProductImages(list);
  };

  const handleSetPrimaryModalImage = (id: string) => {
    onSetPrimaryEditImage(id);
    setEditImages((prev) => prev.map((img) => (img ? { ...img, isPrimary: img.id === id } : img)));
  };

  const handleRemoveModalImage = (id: string) => {
    onRemoveEditImage(id);
    setEditImages((prev) => {
      const filtered = prev.filter((img) => img && img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img?.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const editImageSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const visibleEditImages = useMemo(() => editImages.filter((img): img is ManagedImage => !!img), [editImages]);
  const canReorderEditImages = visibleEditImages.length > 1;

  const handleEditImageDragStart = (event: DragStartEvent) => {
    if (!canReorderEditImages) return;
    setActiveEditImageId(String(event.active.id));
  };

  const handleEditImageDragEnd = (event: DragEndEvent) => {
    const sourceId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;
    setActiveEditImageId(null);
    if (!canReorderEditImages || !targetId || sourceId === targetId) return;

    setEditImages((prev) => {
      const sourceIndex = prev.findIndex((img) => img?.id === sourceId);
      const targetIndex = prev.findIndex((img) => img?.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

      const next = arrayMove(prev, sourceIndex, targetIndex);
      const orderedIds = next.filter((img): img is ManagedImage => !!img).map((img) => img.id);

      if (onReorderEditImages) {
        onReorderEditImages(orderedIds);
      } else {
        const direction: 'up' | 'down' = sourceIndex < targetIndex ? 'down' : 'up';
        const steps = Math.abs(targetIndex - sourceIndex);
        for (let i = 0; i < steps; i += 1) {
          onMoveEditImage(sourceId, direction);
        }
      }
      return next;
    });
  };

  const handleEditImageDragCancel = () => {
    setActiveEditImageId(null);
  };

  const activeEditImage = useMemo(
    () => visibleEditImages.find((img) => img.id === activeEditImageId) ?? null,
    [activeEditImageId, visibleEditImages]
  );

  const visibleProducts = useMemo(
    () => adminProducts.filter((product) => !isProductSoldOrOut(product)),
    [adminProducts]
  );

  const originalOrderIndex = useMemo(() => {
    const map = new Map<string, number>();
    visibleProducts.forEach((product, index) => {
      map.set(product.id, index);
    });
    return map;
  }, [visibleProducts]);

  const compareByStorefrontOrder = (a: Product, b: Product) => {
    const indexA = originalOrderIndex.get(a.id) ?? 0;
    const indexB = originalOrderIndex.get(b.id) ?? 0;
    return indexA - indexB;
  };

  const getSortablePriceCents = (product: Product): number => {
    if (typeof product.priceCents === 'number' && Number.isFinite(product.priceCents)) {
      return product.priceCents;
    }
    const priceCandidate = (product as any).price ?? (product as any).displayPrice ?? '';
    if (typeof priceCandidate === 'number' && Number.isFinite(priceCandidate)) {
      return Math.round(priceCandidate * 100);
    }
    if (typeof priceCandidate === 'string') {
      const numeric = Number(priceCandidate.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(numeric)) return Math.round(numeric * 100);
    }
    return 0;
  };

  const getCreatedAtTimestamp = (product: Product): number | null => {
    const createdAtRaw = product.created_at;
    if (!createdAtRaw || typeof createdAtRaw !== 'string') return null;
    const parsed = Date.parse(createdAtRaw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  const compareByCreatedAt = (a: Product, b: Product, direction: 'desc' | 'asc') => {
    const timeA = getCreatedAtTimestamp(a);
    const timeB = getCreatedAtTimestamp(b);

    const aInvalid = timeA === null;
    const bInvalid = timeB === null;

    // Missing/invalid created_at should always sink to the end for age-based views.
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1;
    if (bInvalid) return -1;

    if (timeA === timeB) return 0;
    return direction === 'desc' ? timeB - timeA : timeA - timeB;
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const normalizedSelectedCategory = normalizeCategory(selectedCategory);

    const filtered = visibleProducts.filter((product) => {
      const name = (product.name ?? '').toLowerCase();
      const desc = ((product as any).description ?? '').toLowerCase();
      const productCategories = getProductCategories(product).map((c) => normalizeCategory(c));

      const matchSearch = !term || name.includes(term) || desc.includes(term);
      const matchCategory =
        selectedCategory === 'All' || productCategories.includes(normalizedSelectedCategory);

      return matchSearch && matchCategory;
    });

    if (sortMode === 'storefront') return filtered;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortMode === 'price_desc' || sortMode === 'price_asc') {
        const priceA = getSortablePriceCents(a);
        const priceB = getSortablePriceCents(b);
        if (priceA !== priceB) {
          return sortMode === 'price_desc' ? priceB - priceA : priceA - priceB;
        }
        return compareByStorefrontOrder(a, b);
      }

      if (sortMode === 'newest') return compareByCreatedAt(a, b, 'desc');
      if (sortMode === 'oldest') return compareByCreatedAt(a, b, 'asc');

      return 0;
    });
    return sorted;
  }, [searchTerm, selectedCategory, sortMode, visibleProducts]);

  const isCategoryReorderEnabled = selectedCategory !== 'All';
  const isCurrentOrderSort = sortMode === 'storefront';
  const canInteractivelyReorder =
    !!onReorderProducts && isCategoryReorderEnabled && isCurrentOrderSort && !isReordering;

  const buildMergedOrderForCategoryDrop = (sourceId: string, targetId: string): Product[] | null => {
    if (!sourceId || !targetId || sourceId === targetId) return null;

    if (selectedCategory === 'All') return null;
    if (sortMode !== 'storefront') return null;

    // Reorder starts from the currently visible category list (after search + active sort mode).
    const visibleCategoryProducts = filteredProducts;
    const sourceIndex = visibleCategoryProducts.findIndex((product) => product.id === sourceId);
    const targetIndex = visibleCategoryProducts.findIndex((product) => product.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null;

    const reorderedVisible = [...visibleCategoryProducts];
    const [moved] = reorderedVisible.splice(sourceIndex, 1);
    reorderedVisible.splice(targetIndex, 0, moved);

    const subsetIds = new Set(visibleCategoryProducts.map((product) => product.id));
    let subsetCursor = 0;

    const fullList = [...adminProducts];
    return fullList.map((product) => {
      if (!subsetIds.has(product.id)) return product;
      const next = reorderedVisible[subsetCursor];
      subsetCursor += 1;
      return next ?? product;
    });
  };

  const handleDropReorder = async (sourceId: string, targetId: string) => {
    if (!canInteractivelyReorder) return;
    const mergedOrder = buildMergedOrderForCategoryDrop(sourceId, targetId);
    if (!mergedOrder || !onReorderProducts) return;

    setIsReordering(true);
    try {
      await onReorderProducts(mergedOrder.map((product) => product.id));
    } catch (error) {
      console.error('Failed to persist product reorder', error);
    } finally {
      setIsReordering(false);
    }
  };

  useEffect(() => {
    if (isEditModalOpen) {
      const hasPrimary = editProductImages.some((img) => img?.isPrimary);
      const fallbackPrimary = editProductImages.find((img) => !!img) || null;
      const imgs = editProductImages.length && !hasPrimary && fallbackPrimary
        ? [{ ...fallbackPrimary, isPrimary: true }, ...editProductImages.filter((img) => img && img.id !== fallbackPrimary.id)]
        : editProductImages;
      setEditImages(imgs);
    }
  }, [isEditModalOpen, editProductImages, editProductId]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDndDragStart = (event: DragStartEvent) => {
    if (!canInteractivelyReorder) return;
    setActiveDragProductId(String(event.active.id));
  };

  const handleDndDragEnd = async (event: DragEndEvent) => {
    const sourceId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;
    setActiveDragProductId(null);
    if (!canInteractivelyReorder) return;
    if (!targetId || sourceId === targetId) return;
    await handleDropReorder(sourceId, targetId);
  };

  const handleDndDragCancel = () => {
    setActiveDragProductId(null);
  };

  const activeDragProduct = useMemo(
    () => filteredProducts.find((product) => product.id === activeDragProductId) ?? null,
    [activeDragProductId, filteredProducts]
  );

  const handleProductVideoChanged = () => {
    if (!onRefreshProducts) return;
    void onRefreshProducts();
  };

  const handleCreateProductSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCreateVideoUploadInFlight) return;

    setCreateVideoFlowMessage(null);
    const created = await onCreateProduct(event);
    const createdProductId =
      created && typeof created === 'object' && 'id' in created && typeof created.id === 'string'
        ? created.id
        : '';

    if (createdProductId && pendingCreateVideoFile) {
      setCreateVideoFlowMessage('Product created. Uploading video...');
      setCreateVideoUploadTargetProductId(createdProductId);
    }
  };

  const handleEditModalOpenChange = (open: boolean) => {
    setIsEditModalOpen(open);
    if (!open) {
      setEditAutoDescriptionEnabled(false);
      setLastEditAutoDescription('');
      onCancelEditProduct();
    }
  };

  const renderStaticProductTile = (product: Product) => (
    <div key={product.id} className="relative touch-pan-y">
      <ProductAdminCard
        product={product}
        onEdit={handleStartEditProduct}
        onDelete={async (id) => {
          await onDeleteProduct(id);
        }}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="lux-card p-6">
        <AdminSectionHeader
          title="Add Products"
          subtitle="Add, edit, and manage all products shown in the storefront."
        />

        <div className="relative">
        <form onSubmit={handleCreateProductSubmit} className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 lg:gap-8">
            <section className="space-y-4">
              <div>
                <label className="lux-label mb-2 block">Product Name</label>
                <input
                  required
                  value={productForm.name}
                  onChange={(e) => onProductFormChange('name', e.target.value)}
                  className="lux-input"
                />
              </div>

              <div>
                <label className="lux-label mb-2 block">Description</label>
                <textarea
                  required
                  value={productForm.description}
                  onChange={(e) => onProductFormChange('description', e.target.value)}
                  className="lux-input min-h-[140px] resize-y"
                  rows={5}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div>
                  <label className="lux-label mb-2 block">Price</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                    value={formatCurrencyDisplay(productForm.price)}
                    onChange={(e) => onProductFormChange('price', sanitizeCurrencyInput(e.target.value))}
                    onBlur={(e) => onProductFormChange('price', formatCurrencyValue(e.target.value))}
                    placeholder="$0.00"
                    className="lux-input h-11"
                  />
                </div>
                <div>
                  <label className="lux-label mb-2 block">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={productForm.quantityAvailable}
                    onChange={(e) => onProductFormChange('quantityAvailable', Number(e.target.value))}
                    className="lux-input h-11"
                    disabled={productForm.isOneOff}
                  />
                </div>
                <div>
                  <label className="lux-label mb-2 block">One-Off</label>
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 px-2.5 h-11 flex items-center justify-center">
                    <ToggleSwitchSmall
                      label="One-off"
                      checked={!!productForm.isOneOff}
                      onChange={(val) => onProductFormChange('isOneOff', val)}
                    />
                  </div>
                </div>
                <div>
                  <label className="lux-label mb-2 block">Active</label>
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 px-2.5 h-11 flex items-center justify-center">
                    <ToggleSwitchSmall
                      label="Active"
                      checked={!!productForm.isActive}
                      onChange={(val) => onProductFormChange('isActive', val)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="lux-label block">Product Settings</label>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 p-2.5 space-y-2 lg:col-span-3 min-h-[190px]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="lux-label block">Categories</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <ToggleSwitchSmall
                          label="Auto Description"
                          checked={autoDescriptionEnabled}
                          onChange={handleCreateAutoDescriptionToggle}
                        />
                        <button
                          type="button"
                          onClick={() => setIsCategoryModalOpen(true)}
                          className="lux-button--ghost px-2 py-1 text-[10px]"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="rounded-shell border border-driftwood/50 bg-linen/50 min-h-[140px]">
                      {categories.length === 0 ? (
                        <p className="px-2 py-2 text-[10px] text-charcoal/60">No categories yet.</p>
                      ) : (
                        categories.map((cat, idx) => {
                          const catName = cat.name || '';
                          const catNameDisplay = (catName || 'Unnamed category').toUpperCase();
                          const key = cat.id || (cat as any).slug || `${catName || 'category'}-${idx}`;
                          return (
                            <label
                              key={key}
                              className="flex items-center gap-2 pl-3 pr-2 py-1 text-[11px] hover:bg-linen/80 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={productForm.category === catName}
                                onChange={() => onProductFormChange('category', catName)}
                                className="h-4 w-4 rounded-[4px] border-driftwood/70 text-deep-ocean"
                              />
                              <span className="uppercase tracking-[0.18em] font-semibold text-charcoal">
                                {catNameDisplay}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 p-2.5 space-y-2 min-h-[190px] flex flex-col justify-between">
                    <div className="space-y-1.5">
                    <label className="lux-label block">Shipping</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                      value={createShippingDisplayValue}
                      onChange={(e) =>
                        onProductFormChange('shippingOverrideAmount', sanitizeCurrencyInput(e.target.value))
                      }
                      onBlur={(e) =>
                        onProductFormChange('shippingOverrideAmount', formatCurrencyValue(e.target.value))
                      }
                      placeholder="0.00"
                      disabled={!productForm.shippingOverrideEnabled}
                      className="lux-input h-9 text-sm disabled:cursor-not-allowed disabled:bg-linen/70 disabled:text-charcoal/45 disabled:border-driftwood/50"
                    />
                    </div>
                    <div className="pt-1">
                      <ToggleSwitchSmall
                        label="Override shipping"
                        checked={!!productForm.shippingOverrideEnabled}
                        onChange={(val) => onProductFormChange('shippingOverrideEnabled', val)}
                      />
                    </div>
                  </div>
                </div>
                {createOverrideAmountInvalid && (
                  <p className="text-xs text-rose-700">Enter a valid amount (0 or more).</p>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={
                      productSaveState === 'saving' ||
                      isCreateVideoUploadInFlight ||
                      isUploading ||
                      failedCount > 0 ||
                      missingUrlCount > 0 ||
                      createOverrideAmountInvalid ||
                      !hasCategories
                    }
                    className="lux-button px-4 py-2 text-[10px] disabled:opacity-50 shrink-0"
                  >
                    {productSaveState === 'saving' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                        <span>Saving...</span>
                      </span>
                    ) : (
                      'Save Product'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onResetProductForm}
                    className="lux-button--ghost px-4 py-2 text-[10px] shrink-0"
                  >
                    Clear
                  </button>
                </div>
                {addProductStatusMessages.length > 0 && (
                  <div className="w-full space-y-1">
                    {addProductStatusMessages.map((message) => (
                      <p key={message} className="text-xs text-charcoal/60 leading-snug">
                        {message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-3">
              <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="lux-label block">Product Images</label>
                <button
                  type="button"
                  onClick={() => productImageFileInputRef.current?.click()}
                  className="lux-button--ghost px-3 py-1 text-[10px]"
                >
                  Upload Images
                </button>
                <input
                  ref={productImageFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (isDev) {
                      console.debug('[shop images] handler fired', {
                        time: new Date().toISOString(),
                        hasEvent: !!e,
                        hasFiles: !!e?.target?.files,
                        filesLen: e?.target?.files?.length ?? 0,
                      });
                    }
                    const fileList = e?.target?.files;
                    const files = fileList ? Array.from(fileList) : [];
                    if (isDev) {
                      console.debug(
                        '[shop images] files extracted',
                        files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                      );
                    }
                    if (files.length === 0) {
                      if (isDev) console.warn('[shop images] no files found; aborting upload');
                      if (e?.target) e.target.value = '';
                      return;
                    }
                    onAddProductImages(files);
                    if (e?.target) e.target.value = '';
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => {
                  const image = productImages[index];
                  if (image) {
                    return (
                      <div
                        key={image.id}
                        className="relative aspect-square rounded-shell-lg overflow-hidden border border-driftwood/60 bg-linen/80"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fileList = e.dataTransfer?.files;
                        const files = Array.from(fileList ?? []);
                        if (isDev) {
                          console.debug(
                            '[shop images] drop files extracted',
                            files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                          );
                        }
                        if (files.length === 0) {
                          if (isDev) console.warn('[shop images] no files found; aborting upload');
                          return;
                        }
                        onAddProductImages(files, index);
                      }}
                      >
                        <ProgressiveImage
                          src={image.previewUrl ?? image.url}
                          alt={`Product image ${index + 1}`}
                          className="h-full w-full"
                          imgClassName="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        {(image.uploading || image.optimizing) && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-charcoal/70">
                            {image.optimizing ? 'Optimizing image...' : 'Uploading...'}
                          </div>
                        )}
                        {image.uploadError && (
                          <div className="absolute inset-x-0 top-0 bg-red-600/90 text-white text-[10px] px-2 py-1">
                            {image.uploadError}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-2 py-1 text-xs text-white">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetPrimaryProductImage(image.id);
                            }}
                            className={`px-2 py-1 rounded-shell ${image.isPrimary ? 'bg-white text-charcoal' : 'bg-black/30 text-white'}`}
                          >
                            {image.isPrimary ? 'Primary' : 'Set primary'}
                          </button>
                          {image.uploadError && image.file && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetryProductImage(image.id);
                              }}
                              className="text-sky-100 hover:text-sky-300"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveProductImage(image.id);
                            }}
                            className="text-red-100 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-center aspect-square rounded-shell-lg border-2 border-dashed border-driftwood/70 bg-linen/70 text-xs text-charcoal/40"
                      onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fileList = e.dataTransfer?.files;
                          const files = fileList ? Array.from(fileList) : [];
                        if (isDev) {
                          console.debug(
                            '[shop images] drop files extracted',
                            files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                          );
                        }
                        if (files.length === 0) {
                          if (isDev) console.warn('[shop images] no files found; aborting upload');
                          return;
                        }
                        onAddProductImages(files, index);
                      }}
                    >
                      <span className="text-[11px] uppercase tracking-[0.22em] font-semibold">Empty Slot</span>
                    </div>
                  );
                })}
              </div>

              <ProductVideoField
                mode="create"
                productId={null}
                initialProductVideo={null}
                onPendingFileChange={(file) => {
                  setPendingCreateVideoFile(file);
                  if (file) {
                    setCreateVideoFlowMessage('Video selected. It will upload after the product is created.');
                  } else if (!isCreateVideoUploadInFlight) {
                    setCreateVideoFlowMessage(null);
                  }
                }}
                createUploadTargetProductId={createVideoUploadTargetProductId}
                onCreateUploadSettled={async (result) => {
                  setCreateVideoUploadTargetProductId(null);
                  setPendingCreateVideoFile(null);
                  setCreateVideoFlowMessage(
                    result.ok
                      ? 'Product created and video upload started successfully.'
                      : 'Product created, but the video upload failed. Open Edit Product to retry.'
                  );
                  if (onRefreshProducts) {
                    await onRefreshProducts();
                  }
                }}
              />
              </div>
            </aside>
          </div>
        </form>
      </div>
    </div>

      <CategoryManagementModal
        open={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onCategoriesChange={(updated) => setCategories(normalizeCategoriesList(updated))}
        onCategorySelected={(name) => onProductFormChange('category', name)}
      />

      <div className="mt-8 rounded-shell-xl border border-driftwood/55 bg-white/70 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="lux-eyebrow">Edit Current Products</h3>
            <p className="text-[10px] uppercase tracking-[0.18em] text-charcoal/60">
              Storefront-inspired view, compact for admin editing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`rounded-shell border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold transition ${
                selectedCategory === 'All'
                  ? 'border-deep-ocean bg-deep-ocean text-white shadow-sm'
                  : 'border-driftwood/70 bg-white/85 text-deep-ocean hover:bg-sand/75'
              }`}
            >
              All
            </button>
            {categories.map((category, idx) => {
              const name = (category.name || '').trim();
              if (!name) return null;
              const key = category.id || (category as any).slug || `${name || 'category'}-${idx}`;
              const isActive = selectedCategory === name;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCategory(name)}
                  className={`rounded-shell border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold transition ${
                    isActive
                      ? 'border-deep-ocean bg-deep-ocean text-white shadow-sm'
                      : 'border-driftwood/70 bg-white/85 text-deep-ocean hover:bg-sand/75'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_190px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              className="lux-input h-10 text-sm"
            />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as AdminProductSortMode)}
              className="lux-input h-10 text-[11px] uppercase tracking-[0.18em] font-semibold text-deep-ocean"
              aria-label="Sort products"
            >
              {ADMIN_PRODUCT_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isCategoryReorderEnabled && selectedCategory === 'All' && (
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-charcoal/60">
            Select a category to reorder products.
          </p>
        )}

        {isCategoryReorderEnabled && isCurrentOrderSort && (
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-charcoal/60">
            Drag products to update their storefront order.
          </p>
        )}

        {isCategoryReorderEnabled && !isCurrentOrderSort && (
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-charcoal/60">
            Switch sort to Current Order to reorder products.
          </p>
        )}

        {isLoadingProducts && (
          <div className="mb-3 flex items-center gap-2 text-sm text-charcoal/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="rounded-shell-lg border border-dashed border-driftwood/60 bg-white/70 py-8 text-center text-charcoal/60">
            No active products
          </div>
        ) : canInteractivelyReorder ? (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragStart={handleDndDragStart}
            onDragEnd={handleDndDragEnd}
            onDragCancel={handleDndDragCancel}
            modifiers={[restrictToVerticalAxis]}
            autoScroll={false}
          >
            <SortableContext items={filteredProducts.map((product) => product.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((product) => (
                  <SortableAdminProductTile
                    key={product.id}
                    product={product}
                    canReorder={canInteractivelyReorder}
                    isReordering={isReordering}
                    onEdit={handleStartEditProduct}
                    onDelete={async (id) => {
                      await onDeleteProduct(id);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDragProduct ? (
                <div className="pointer-events-none w-[min(320px,72vw)]">
                  <ProductAdminCard product={activeDragProduct} onEdit={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => renderStaticProductTile(product))}
          </div>
        )}
      </div>

      <Dialog open={isEditModalOpen} onOpenChange={handleEditModalOpenChange}>
        <DialogContent className="flex min-h-0 flex-col p-0 bg-white">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onUpdateProduct(e);
              if (ok) {
                setIsEditModalOpen(false);
              }
            }}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-driftwood/60 bg-white px-6 py-4">
              <DialogTitle>Edit Product</DialogTitle>
              <div className="flex items-center gap-2">
                {editProductId && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="lux-button--ghost px-2 py-1 text-[10px] !text-rose-700"
                    aria-label="Delete product"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onCancelEditProduct();
                    setIsEditModalOpen(false);
                  }}
                  className="lux-button--ghost px-3 py-1 text-[10px]"
                >
                  CLOSE
                </button>
                <button
                  type="submit"
                  disabled={editProductSaveState === 'saving' || editOverrideAmountInvalid || !hasCategories}
                  className="lux-button px-3 py-1 text-[10px] disabled:opacity-50"
                >
                  {editProductSaveState === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 pb-6">
              <div>
                <label className="lux-label mb-2 block">Name</label>
                <input
                  value={editProductForm?.name || ''}
                  onChange={(e) => onEditFormChange('name', e.target.value)}
                  className="lux-input text-sm"
                />
              </div>

              <div>
                <label className="lux-label mb-2 block">Description</label>
                <textarea
                  value={editProductForm?.description || ''}
                  onChange={(e) => onEditFormChange('description', e.target.value)}
                  className="lux-input min-h-[140px] resize-y text-sm"
                  rows={6}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="lux-label mb-2 block">Price</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                    value={formatCurrencyDisplay(editProductForm?.price || '')}
                    onChange={(e) => onEditFormChange('price', sanitizeCurrencyInput(e.target.value))}
                    onBlur={(e) => onEditFormChange('price', formatCurrencyValue(e.target.value))}
                    placeholder="$0.00"
                    className="lux-input text-sm"
                  />
                </div>
                <div>
                  <label className="lux-label mb-2 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editProductForm?.quantityAvailable ?? 1}
                    onChange={(e) => onEditFormChange('quantityAvailable', Number(e.target.value))}
                    className="lux-input text-sm"
                    disabled={editProductForm?.isOneOff}
                  />
                </div>
                <div>
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="lux-label block">Category</label>
                    <ToggleSwitchSmall
                      label="Auto Description"
                      checked={editAutoDescriptionEnabled}
                      onChange={handleEditAutoDescriptionToggle}
                    />
                  </div>
                  <select
                    value={editProductForm?.category}
                    onChange={(e) => onEditFormChange('category', e.target.value)}
                    className="lux-input text-[11px] uppercase tracking-[0.22em] font-semibold"
                  >
                    {categories.length === 0 ? (
                      <option value="">NO CATEGORIES AVAILABLE</option>
                    ) : (
                      categories.map((option, idx) => {
                        const name = option.name || '';
                        const key = option.id || (option as any).slug || `${name || 'category'}-${idx}`;
                        return (
                          <option key={key} value={name}>
                            {(name || 'UNNAMED CATEGORY').toUpperCase()}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="lux-label block">Product Settings</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 rounded-shell-lg border border-driftwood/60 bg-linen/40 p-3">
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 px-2.5 py-3.5 flex flex-col justify-center gap-2.5">
                    <ToggleSwitchSmall
                      label="One-off"
                      checked={!!editProductForm?.isOneOff}
                      onChange={(val) => onEditFormChange('isOneOff', val)}
                    />
                    <ToggleSwitchSmall
                      label="Active"
                      checked={!!editProductForm?.isActive}
                      onChange={(val) => onEditFormChange('isActive', val)}
                    />
                  </div>
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 px-2.5 py-3.5 flex flex-col justify-center gap-2.5">
                    <ToggleSwitchSmall
                      label="Override shipping"
                      checked={!!editProductForm?.shippingOverrideEnabled}
                      onChange={(val) => onEditFormChange('shippingOverrideEnabled', val)}
                    />
                    <div aria-hidden className="h-6" />
                  </div>
                  <div className="rounded-shell border border-driftwood/60 bg-white/80 p-2.5 space-y-1.5">
                    <label className="lux-label block text-center">Shipping</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="^\\$?\\d*(\\.\\d{0,2})?$"
                      value={editShippingDisplayValue}
                      onChange={(e) =>
                        onEditFormChange('shippingOverrideAmount', sanitizeCurrencyInput(e.target.value))
                      }
                      onBlur={(e) =>
                        onEditFormChange('shippingOverrideAmount', formatCurrencyValue(e.target.value))
                      }
                      placeholder="0.00"
                      disabled={!editProductForm?.shippingOverrideEnabled}
                      className="lux-input text-sm disabled:cursor-not-allowed disabled:bg-linen/70 disabled:text-charcoal/45 disabled:border-driftwood/50"
                    />
                  </div>
                </div>
              </div>

              {editOverrideAmountInvalid && (
                <p className="text-xs text-rose-700">Enter a valid amount (0 or more).</p>
              )}

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="lux-label block">Product Images</label>
                  <button
                    type="button"
                    onClick={() => editProductImageFileInputRef.current?.click()}
                    className="lux-button--ghost px-3 py-1 text-[10px]"
                  >
                    Upload
                  </button>
                  <input
                    ref={editProductImageFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (isDev) {
                        console.debug('[shop images] handler fired', {
                          time: new Date().toISOString(),
                          hasEvent: !!e,
                          hasFiles: !!e?.target?.files,
                          filesLen: e?.target?.files?.length ?? 0,
                        });
                      }
                      const fileList = e?.target?.files;
                      const files = fileList ? Array.from(fileList) : [];
                      if (isDev) {
                        console.debug(
                          '[shop images] files extracted',
                          files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                        );
                      }
                      if (files.length === 0) {
                        if (isDev) console.warn('[shop images] no files found; aborting upload');
                        if (e?.target) e.target.value = '';
                        return;
                      }
                      handleModalFileSelect(fileList);
                      if (editProductImageFileInputRef.current) editProductImageFileInputRef.current.value = '';
                    }}
                  />
                </div>

                <DndContext
                  sensors={editImageSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleEditImageDragStart}
                  onDragEnd={handleEditImageDragEnd}
                  onDragCancel={handleEditImageDragCancel}
                >
                  <SortableContext items={visibleEditImages.map((img) => img.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 touch-pan-y">
                      {visibleEditImages.map((image, idx) => (
                        <SortableEditImageTile
                          key={image.id}
                          image={image}
                          index={idx}
                          canReorder={canReorderEditImages}
                          onSetPrimary={handleSetPrimaryModalImage}
                          onRetry={onRetryEditImage}
                          onRemove={handleRemoveModalImage}
                        />
                      ))}

                      {Array.from({
                        length: Math.max(0, maxModalImages - visibleEditImages.length),
                      }).map((_, idx) => (
                        <div
                          key={`empty-edit-slot-${idx}`}
                          className="flex items-center justify-center aspect-square rounded-shell-lg border-2 border-dashed border-driftwood/70 bg-linen/70 text-xs text-charcoal/40"
                        >
                          Empty Slot
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeEditImage ? (
                      <div className="w-[min(240px,46vw)] rounded-shell-lg overflow-hidden border border-driftwood/60 bg-linen/80 shadow-lg pointer-events-none">
                        <ProgressiveImage
                          src={activeEditImage.previewUrl ?? activeEditImage.url}
                          alt="Dragging product image"
                          className="h-full w-full"
                          imgClassName="h-full w-full object-cover aspect-square"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                <ProductVideoField
                  mode="edit"
                  productId={editProductId}
                  initialProductVideo={activeEditProduct?.productVideo || null}
                  onVideoChanged={handleProductVideoChanged}
                />
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Are you sure?"
        description="This will permanently delete this product."
        confirmText={isDeleting ? 'Deleting...' : 'Confirm'}
        cancelText="Cancel"
        confirmVariant="danger"
        confirmDisabled={isDeleting}
        cancelDisabled={isDeleting}
        onCancel={() => {
          if (!isDeleting) setIsDeleteConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (!editProductId) return;
          setIsDeleting(true);
          try {
            await onDeleteProduct(editProductId);
            setIsDeleteConfirmOpen(false);
            onCancelEditProduct();
            setIsEditModalOpen(false);
          } catch (err) {
            console.error('Delete product failed', err);
          } finally {
            setIsDeleting(false);
          }
        }}
      />
      {productStatus.type && (
        <div className="pointer-events-none absolute left-1/2 bottom-4 z-20 -translate-x-1/2">
          <div
            className={`pointer-events-auto rounded-shell px-4 py-2 text-sm shadow-md ${
              productStatus.type === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {productStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

function formatPriceDisplay(priceCents?: number) {
  if (priceCents === undefined || priceCents === null) return '$0.00';
  return `$${(priceCents / 100).toFixed(2)}`;
}

function sanitizeCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const intPart = cleaned.slice(0, firstDot);
  const decPart = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return `${intPart}.${decPart.slice(0, 2)}`;
}

function formatCurrencyDisplay(value: string): string {
  const sanitized = sanitizeCurrencyInput(value);
  if (!sanitized) return '';
  return `$${sanitized}`;
}

function formatCurrencyValue(value: string): string {
  const sanitized = sanitizeCurrencyInput(value);
  if (!sanitized) return '';
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return parsed.toFixed(2);
}

function parseCurrencyToCents(value: string): number | null {
  const sanitized = sanitizeCurrencyInput(value);
  if (!sanitized) return null;
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleSwitch({ label, description, checked, onChange }: ToggleSwitchProps) {
  const trackClasses = checked ? 'bg-deep-ocean border-deep-ocean' : 'bg-sea-glass/30 border-driftwood/70';
  const thumbClasses = checked ? 'translate-x-5' : 'translate-x-1';

  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3">
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full rounded-ui border transition-colors ${trackClasses}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full rounded-ui bg-white shadow transform transition-transform ${thumbClasses}`}
        />
      </span>
      <div className="flex flex-col text-left">
        <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal">{label}</span>
        {description && <span className="text-[10px] uppercase tracking-[0.18em] text-charcoal/60">{description}</span>}
      </div>
    </button>
  );
}

function ToggleSwitchSmall({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const trackClasses = checked ? 'bg-deep-ocean border-deep-ocean' : 'bg-sea-glass/30 border-driftwood/70';
  const thumbClasses = checked ? 'translate-x-4' : 'translate-x-0.5';

  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2">
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full rounded-ui border transition-colors ${trackClasses}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full rounded-ui bg-white shadow transform transition-transform ${thumbClasses}`}
        />
      </span>
      <span className="text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80">{label}</span>
    </button>
  );
}

function ToggleSwitchWithSubtext({
  label,
  subtext,
  checked,
  onChange,
  small = false,
}: {
  label: string;
  subtext: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  small?: boolean;
}) {
  const trackClasses = checked ? 'bg-deep-ocean border-deep-ocean' : 'bg-sea-glass/30 border-driftwood/70';
  const thumbClasses = small ? (checked ? 'translate-x-4' : 'translate-x-0.5') : checked ? 'translate-x-5' : 'translate-x-1';
  const trackSizeClasses = small ? 'h-5 w-9' : 'h-6 w-11';
  const labelClasses = small
    ? 'text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal/80'
    : 'text-[11px] uppercase tracking-[0.22em] font-semibold text-charcoal';

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full text-left ${small ? 'flex items-start gap-2' : 'flex items-start gap-3'}`}
    >
      <span
        className={`relative inline-flex ${trackSizeClasses} items-center rounded-full rounded-ui border transition-colors shrink-0 ${trackClasses}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full rounded-ui bg-white shadow transform transition-transform ${thumbClasses}`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${labelClasses}`}>{label}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-charcoal/55">
          {subtext}
        </span>
      </span>
    </button>
  );
}

function ManagedImagesList({
  images,
  onSetPrimary,
  onMove,
  onRemove,
}: {
  images: ManagedImage[];
  onSetPrimary: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
}) {
  if (!images.length) {
    return (
      <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-charcoal/60 border border-driftwood/60 rounded-shell-lg bg-white/70 p-3">
        No Images Yet. Upload to Add.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {images.map((img, idx) => (
        <div key={img.id} className="border border-driftwood/60 rounded-shell-lg overflow-hidden bg-white/80">
          <div className="aspect-square bg-linen/80 overflow-hidden">
            <ProgressiveImage
              src={img.previewUrl ?? img.url}
              alt={`upload-${idx}`}
              className="h-full w-full"
              imgClassName="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="p-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onSetPrimary(img.id)}
                className={`rounded-shell px-2 py-1 text-[10px] ${img.isPrimary ? 'bg-deep-ocean text-white' : 'bg-linen/80 text-charcoal/80 border border-driftwood/60'}`}
              >
                {img.isPrimary ? 'Primary' : 'Set primary'}
              </button>
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onMove(img.id, 'up')}
                className="flex-1 lux-button--ghost px-2 py-1 text-[10px]"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => onMove(img.id, 'down')}
                className="flex-1 lux-button--ghost px-2 py-1 text-[10px]"
              >
                Down
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
