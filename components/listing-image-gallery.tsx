'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ListingImageGalleryProps = {
  images: string[];
  title: string;
};

export function ListingImageGallery({ images, title }: ListingImageGalleryProps) {
  const normalized = useMemo(() => images.filter((src) => typeof src === 'string' && src.trim() !== ''), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [singleView, setSingleView] = useState(false);
  const [failedMap, setFailedMap] = useState<Record<string, true>>({});

  const markFailed = useCallback((src: string) => {
    const key = src.trim();
    if (!key) return;
    setFailedMap((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const safeImages = useMemo(() => normalized.filter((src) => !failedMap[src.trim()]), [normalized, failedMap]);

  useEffect(() => {
    setActiveIndex(0);
    setSingleView(false);
    setZoomOpen(false);
    setFailedMap({});
  }, [images]);

  useEffect(() => {
    if (activeIndex < safeImages.length) return;
    setActiveIndex(0);
  }, [activeIndex, safeImages.length]);

  useEffect(() => {
    if (!zoomOpen || safeImages.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setZoomOpen(false);
        return;
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev + 1) % safeImages.length);
        return;
      }
      if (event.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [safeImages.length, zoomOpen]);

  if (safeImages.length === 0) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Tin đăng chưa có ảnh hợp lệ
      </div>
    );
  }

  const mainImage = safeImages[activeIndex] ?? safeImages[0] ?? '';
  if (!mainImage) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Tin đăng chưa có ảnh hợp lệ
      </div>
    );
  }

  return (
    <>
      {singleView ? (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <button type="button" className="relative block min-h-[230px] w-full overflow-hidden sm:min-h-[480px]" onClick={() => setZoomOpen(true)} aria-label="Mở ảnh lớn">
            <Image
              src={mainImage}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 80vw"
              unoptimized
              onError={() => markFailed(mainImage)}
            />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-xl border border-slate-100">
          <button
            type="button"
            className="relative col-span-3 row-span-3 min-h-[230px] overflow-hidden sm:min-h-[360px]"
            onClick={() => setZoomOpen(true)}
            aria-label="Mở ảnh lớn"
          >
            <Image
              src={mainImage}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 75vw, (max-width: 1024px) 66vw, 60vw"
              unoptimized
              onError={() => markFailed(mainImage)}
            />
          </button>

          {[0, 1, 2, 3].map((offset) => {
            const index = (activeIndex + offset + 1) % safeImages.length;
            const src = safeImages[index] ?? mainImage;
            return (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="relative h-[76px] overflow-hidden sm:h-[118px]"
                aria-label={`Chọn ảnh ${index + 1}`}
              >
                <Image
                  src={src}
                  alt={`${title} ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 25vw, 140px"
                  unoptimized
                  onError={() => markFailed(src)}
                />
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {safeImages.map((src, index) => (
          <button
            key={`${src}-${index}-thumb`}
            type="button"
            onClick={() => {
              setActiveIndex(index);
              setSingleView(true);
            }}
            className={`relative h-16 overflow-hidden rounded border ${activeIndex === index ? 'border-[var(--brand-primary)]' : 'border-slate-200'}`}
            aria-label={`Ảnh thu nhỏ ${index + 1}`}
          >
            <Image
              src={src}
              alt={`${title} thumb ${index + 1}`}
              fill
              className="object-cover"
              sizes="96px"
              unoptimized
              onError={() => markFailed(src)}
            />
          </button>
        ))}
      </div>

      {zoomOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute right-4 top-4 rounded bg-white px-3 py-1 text-sm font-semibold" onClick={() => setZoomOpen(false)}>
            Đóng
          </button>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded bg-white px-3 py-2 text-xl"
            onClick={() => setActiveIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length)}
            aria-label="Ảnh trước"
          >
            ‹
          </button>
          <img src={mainImage} alt={title} className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain" onError={() => markFailed(mainImage)} />
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded bg-white px-3 py-2 text-xl"
            onClick={() => setActiveIndex((prev) => (prev + 1) % safeImages.length)}
            aria-label="Ảnh sau"
          >
            ›
          </button>
        </div>
      ) : null}
    </>
  );
}
