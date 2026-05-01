import { useEffect, useMemo, useState } from 'react';
import { fetchCategories } from '../lib/publicApi';
import type { Category } from '../lib/types';
import { trackGenerateLead } from '../lib/analytics';

interface ContactFormProps {
  backgroundColor?: string;
  variant?: 'card' | 'embedded';
  defaultInquiryType?: 'message' | 'custom_order';
  mode?: 'default' | 'custom-order';
}

export function ContactForm({
  backgroundColor = '#FAC6C8',
  variant = 'card',
  defaultInquiryType = 'message',
  mode = 'default',
}: ContactFormProps) {
  const isCustomOrderMode = mode === 'custom-order';
  const initialInquiryType = isCustomOrderMode ? 'custom_order' : defaultInquiryType;
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [inquiryType, setInquiryType] = useState<'message' | 'custom_order'>(initialInquiryType);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedType, setSubmittedType] = useState<'message' | 'custom_order'>(initialInquiryType);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);

  const MAX_IMAGE_BYTES = 8_000_000; // 8MB raw upload cap (client-side)
  const MAX_DATA_URL_LENGTH = 1_800_000; // matches backend size guard (~1.8MB chars)
  const MAX_IMAGE_DIMENSION = 1600;
  const IMAGE_QUALITY = 0.82;
  const debugMessages = import.meta.env.VITE_DEBUG_MESSAGES === '1' || import.meta.env.DEV;

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    if (isCustomOrderMode) {
      setInquiryType('custom_order');
    }
  }, [isCustomOrderMode]);

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const data = await fetchCategories();
        if (!isMounted) return;
        setCategories(Array.isArray(data) ? data : []);
        setCategoryError(null);
      } catch (err) {
        if (!isMounted) return;
        setCategories([]);
        setCategoryError('Categories are loading soon.');
      } finally {
        if (isMounted) setIsLoadingCategories(false);
      }
    };
    void loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  const categoryChips = useMemo(() => {
    const filtered = categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
    return filtered;
  }, [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    setSubmitError(null);

    try {
      const imageUrl = imageDataUrl || null;

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          imageUrl: imageUrl || undefined,
          type: inquiryType,
          categoryIds:
            inquiryType === 'custom_order' ? selectedCategories.map((category) => category.id) : undefined,
          categoryNames:
            inquiryType === 'custom_order' ? selectedCategories.map((category) => category.name) : undefined,
        }),
      });

      if (!res.ok) {
        let errorMessage = 'Failed to send message';
        try {
          const data = await res.json();
          if (data?.error) errorMessage = data.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      const data = await res.json().catch(() => null);
      if (data?.success === false && data?.error) {
        throw new Error(data.error);
      }

      const formLocation = typeof window !== 'undefined' ? window.location.pathname : undefined;
      trackGenerateLead({
        form_variant: variant,
        form_type: inquiryType,
        form_location: formLocation,
      });

      setSubmitStatus('success');
      setSubmittedType(inquiryType);
      setFormData({ name: '', email: '', message: '' });
      setInquiryType(isCustomOrderMode ? 'custom_order' : defaultInquiryType);
      setSelectedCategories([]);
      setImageFile(null);
      setImagePreview(null);
      setImageDataUrl(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setSubmitStatus('error');
      setSubmitError(error instanceof Error ? error.message : 'There was an error sending your message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleInquiryTypeChange = (type: 'message' | 'custom_order') => {
    setInquiryType(type);
    if (type === 'message') {
      setSelectedCategories([]);
    }
  };

  const handleSelectCategory = (chip: { id: string; name: string }) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((category) => category.id === chip.id);
      if (exists) {
        return prev.filter((category) => category.id !== chip.id);
      }
      return [...prev, { id: chip.id, name: chip.name }];
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to read image'));
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  const compressImageToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = MAX_IMAGE_DIMENSION;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const targetWidth = Math.max(1, Math.round(img.width * scale));
        const targetHeight = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Image processing failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to read image'));
      };
      img.src = objectUrl;
    });

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    if (file.size > MAX_IMAGE_BYTES) {
      setImageFile(null);
      setImageDataUrl(null);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }
      setSubmitStatus('error');
      setSubmitError('Image too large. Please upload a photo under 8MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setSubmitStatus('error');
      setSubmitError('Unsupported file type. Please upload an image.');
      return;
    }
    setSubmitError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setIsImageProcessing(true);
    setImageDataUrl(null);
    compressImageToDataUrl(file)
      .then((dataUrl) => {
        if (debugMessages) {
          console.debug('[contact form] image processed', {
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrlLength: dataUrl.length,
          });
        }
        if (dataUrl.length > MAX_DATA_URL_LENGTH) {
          setSubmitStatus('error');
          setSubmitError('Image is still too large after compression. Please use a smaller photo.');
          setImageFile(null);
          setImageDataUrl(null);
          return;
        }
        setImageDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to process image', err);
        setSubmitStatus('error');
        setSubmitError('Unable to process image. Please try another photo.');
        setImageFile(null);
        setImageDataUrl(null);
      })
      .finally(() => {
        setIsImageProcessing(false);
      });
  };

  return (
    <div className={variant === 'embedded' ? 'py-0 ca-form-skin' : 'py-12 ca-form-skin'} id="contact" style={{ backgroundColor }}>
      <div className="ca-container">
        {variant !== 'embedded' && (
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <div className="ca-eyebrow mb-4">Get In Touch</div>
            <h2 className="ca-section-title">Send a note.</h2>
            <p className="ca-copy mx-auto mt-4 max-w-2xl">
              Interested in a custom piece or looking for something specific? Send a message and I'll reply shortly.
            </p>
          </div>
        )}
        <div
          className={
            variant === 'embedded'
              ? 'w-full max-w-4xl mx-auto'
              : 'w-full max-w-4xl mx-auto border border-[var(--ca-border)] bg-white p-5 sm:p-8'
          }
        >
          <form onSubmit={handleSubmit} className={variant === 'embedded' ? 'space-y-6' : 'space-y-6'}>
            {!isCustomOrderMode && (
              <div className="flex justify-center max-sm:px-1">
                <div className="inline-flex border border-[var(--ca-border)] bg-white p-1 max-sm:w-full max-sm:max-w-full max-sm:flex-nowrap max-sm:justify-center max-sm:items-center max-sm:box-border max-sm:overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleInquiryTypeChange('message')}
                    className={`px-4 py-2 text-[10px] font-medium uppercase tracking-[0.26em] transition whitespace-nowrap max-sm:px-3 max-sm:py-2.5 max-sm:text-[10px] ${
                      inquiryType === 'message'
                        ? 'bg-[var(--ca-navy)] text-white'
                        : 'text-[var(--ca-navy)] hover:bg-[var(--ca-paper)]'
                    }`}
                  >
                    Message
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInquiryTypeChange('custom_order')}
                    className={`px-4 py-2 text-[10px] font-medium uppercase tracking-[0.26em] transition whitespace-nowrap max-sm:px-3 max-sm:py-2.5 max-sm:text-[10px] ${
                      inquiryType === 'custom_order'
                        ? 'bg-[var(--ca-navy)] text-white'
                        : 'text-[var(--ca-navy)] hover:bg-[var(--ca-paper)]'
                    }`}
                  >
                    Custom Order
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 min-h-0 flex flex-col">
              {inquiryType === 'custom_order' ? (
                <>
                  {categoryError && (
                    <p className="ca-copy text-center text-xs max-md:hidden">{categoryError}</p>
                  )}
                  {isLoadingCategories ? (
                    <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-2 max-md:hidden">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={`contact-chip-skeleton-${index}`}
                          className="h-10 w-24 bg-[var(--ca-border)] animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3 max-md:hidden">
                      {categoryChips.map((chip) => {
                        const isSelected = selectedCategories.some((category) => category.id === chip.id);
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleSelectCategory(chip)}
                            className={`min-h-[40px] border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.26em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ca-navy)] ${
                              isSelected
                                ? 'border-[var(--ca-navy)] bg-[var(--ca-navy)] text-white'
                                : 'border-[var(--ca-border)] bg-white text-[var(--ca-navy)] hover:border-[var(--ca-navy)]'
                            }`}
                          >
                            {chip.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div aria-hidden className="h-0" />
              )}
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="lux-input"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="mb-2 block"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="lux-input"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="mb-2 block"
              >
                {isCustomOrderMode ? 'Custom request details' : 'Message'}
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                value={formData.message}
                onChange={handleChange}
                placeholder={
                  isCustomOrderMode
                    ? "Tell us what you have in mind - size, colors, room, occasion, timeline, or inspiration."
                    : "Tell me what you're looking for - custom ideas, questions, or details."
                }
                className="lux-input resize-none"
              />
            </div>

            <div>
              <div
                className="cursor-pointer border border-dashed border-[var(--ca-border-strong)] bg-white p-5 text-center text-sm text-[var(--ca-muted)] transition hover:border-[var(--ca-navy)]"
                onClick={() => document.getElementById('contact-image-input')?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <input
                  id="contact-image-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {imagePreview ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={imagePreview} alt="Upload preview" className="h-32 w-32 object-cover border border-[var(--ca-border)]" />
                    <span className="ca-copy text-xs">Click or drop to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--ca-ink)]">
                      Share a photo (optional)
                    </span>
                    <span className="ca-copy text-xs">
                      Upload images, inspiration, or designs you'd like us to reference
                    </span>
                  </div>
                )}
              </div>
            </div>

            {submitStatus === 'success' && (
              <div className="border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
                {submittedType === 'message'
                  ? 'Thank you for your message! We typically respond within 24-48 Hours'
                  : "Got it - we'll follow up with next steps."}
              </div>
            )}

            {submitStatus === 'error' && (
              <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {submitError || 'There was an error sending your message. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isImageProcessing}
              className="ca-button ca-button-filled w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || isImageProcessing
                ? 'Sending...'
                : isCustomOrderMode
                  ? 'SEND CUSTOM REQUEST'
                  : 'SEND MESSAGE'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
