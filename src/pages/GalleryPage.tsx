import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSoldProducts } from '../lib/publicApi';
import { Product } from '../lib/types';
import { useGalleryImages } from '../lib/hooks/useGalleryImages';
import { ProgressiveImage } from '../components/ui/ProgressiveImage';
import { withImageWidthHint } from '../lib/images';

type GalleryTile = {
  id: string;
  imageUrl: string;
  title: string;
  caption: string;
  ratio: string;
};

export function GalleryPage() {
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);
  const [isLoadingSold, setIsLoadingSold] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { images: galleryImages, isLoading: isLoadingGallery } = useGalleryImages();
  const getSoldCardTitle = (item: Product) =>
    item.id?.startsWith('custom_order:') ? 'Custom Order' : item.name;
  const formatCategoryLabel = (value?: string | null) => {
    if (!value) return '';
    return value
      .toLowerCase()
      .split(/\s+/)
      .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ''))
      .join(' ');
  };

  useEffect(() => {
    const loadSold = async () => {
      try {
        const sold = await fetchSoldProducts();
        setSoldProducts(sold);
      } catch (error) {
        console.error('Error loading gallery data:', error);
      } finally {
        setIsLoadingSold(false);
      }
    };
    loadSold();
  }, []);

  const isLoading = isLoadingGallery || isLoadingSold;
  const galleryItems: GalleryTile[] = galleryImages
    .map((item, index) => ({
      id: item.id,
      imageUrl: item.imageUrl,
      title: item.title || `Studio piece ${index + 1}`,
      caption: item.title || '',
      ratio: index % 3 === 0 ? '3 / 4' : index % 3 === 1 ? '1 / 1' : '4 / 5',
    }))
    .filter((item) => item.imageUrl);
  const soldGalleryItems: GalleryTile[] = soldProducts
    .map((item, index) => ({
      id: item.id,
      imageUrl: item.imageUrl,
      title: getSoldCardTitle(item),
      caption: `${getSoldCardTitle(item)}${item.collection ? ` - ${formatCategoryLabel(item.collection)}` : ''}`,
      ratio: index % 3 === 0 ? '4 / 5' : index % 3 === 1 ? '3 / 4' : '1 / 1',
    }))
    .filter((item) => item.imageUrl);
  const columns = [0, 1, 2].map((columnIndex) =>
    galleryItems.filter((_, index) => index % 3 === columnIndex)
  );
  const soldColumns = [0, 1, 2].map((columnIndex) =>
    soldGalleryItems.filter((_, index) => index % 3 === columnIndex)
  );

  const renderColumns = (columnSet: GalleryTile[][], altFallback: string) => (
    <div className="ca-gallery-cols">
      {columnSet.map((column, columnIndex) => (
        <div
          className="ca-gallery-col"
          key={`${altFallback}-column-${columnIndex}`}
          style={{ marginTop: columnIndex === 1 ? '5rem' : columnIndex === 2 ? '2rem' : '0rem' }}
        >
          {column.map((item) => (
            <figure className="ca-gallery-tile" key={item.id}>
              <button
                type="button"
                className="ca-gallery-tile-media block text-left"
                style={{ aspectRatio: item.ratio }}
                onClick={() => setSelectedImage(item.imageUrl)}
              >
                <ProgressiveImage
                  src={withImageWidthHint(item.imageUrl || '', 700)}
                  alt={item.title || altFallback}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover"
                  width={700}
                  height={900}
                  loading="lazy"
                  decoding="async"
                />
              </button>
              {item.caption ? <figcaption className="ca-gallery-caption">{item.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="ca-page min-h-screen">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">Gallery</div>
        <h1>A look through the studio.</h1>
        <p className="ca-copy mx-auto mt-4 max-w-2xl">
          A growing archive of finished pieces, custom commissions, and works in progress - pulled together so you can get a feel for the work before reaching out.
        </p>
      </header>

      <section className="ca-section">
        <div className="ca-container">
          {isLoading ? (
            <div className="py-12 text-center">
              <p className="ca-copy">Loading gallery...</p>
            </div>
          ) : galleryItems.length === 0 ? (
            <div className="ca-copy">No images yet.</div>
          ) : (
            renderColumns(columns, 'Gallery item')
          )}

          {soldGalleryItems.length > 0 && (
            <section className="mt-16 border-t border-[var(--ca-border)] pt-12">
              <div className="mb-10 text-center">
                <div className="ca-eyebrow mb-4">Archive</div>
                <h2 className="ca-section-title">Sold Products</h2>
              </div>
              {renderColumns(soldColumns, 'Sold product')}
            </section>
          )}

          <div className="mt-12 text-center">
            <Link to="/shop" className="ca-button ca-button-filled">
              Shop The Collection
            </Link>
          </div>
        </div>
      </section>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="Gallery item"
            className="max-w-full max-h-full object-contain"
            decoding="async"
          />
        </div>
      )}
    </div>
  );
}
