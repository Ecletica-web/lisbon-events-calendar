'use client'

import { useState } from 'react'

const FALLBACK = '/lisboa.png'

function resolveImages(imageUrl?: string, imageUrls?: string[]): string[] {
  const fromList = (imageUrls || []).filter(Boolean)
  if (fromList.length > 0) return fromList
  if (imageUrl) return [imageUrl]
  return [FALLBACK]
}

type ThumbProps = {
  imageUrl?: string
  imageUrls?: string[]
  alt: string
  className?: string
}

/** Compact mosaic for cards / list rows (1 image, split, or up to 2×2). */
export function EventImageThumb({ imageUrl, imageUrls, alt, className = '' }: ThumbProps) {
  const images = resolveImages(imageUrl, imageUrls)
  const show = images.slice(0, 4)
  const extra = images.length - show.length

  if (show.length === 1) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={show[0]}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = FALLBACK
          }}
        />
      </div>
    )
  }

  if (show.length === 2) {
    return (
      <div className={`relative grid grid-cols-2 gap-0.5 overflow-hidden ${className}`}>
        {show.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={i === 0 ? alt : ''}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = FALLBACK
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={`relative grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden ${className}`}>
      {show.map((src, i) => (
        <div key={`${src}-${i}`} className="relative min-h-0 min-w-0 overflow-hidden">
          <img
            src={src}
            alt={i === 0 ? alt : ''}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = FALLBACK
            }}
          />
          {i === show.length - 1 && extra > 0 && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-xs font-semibold">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

type GalleryProps = {
  imageUrl?: string
  imageUrls?: string[]
  alt: string
  className?: string
  /** Height class for the main viewer (modal). */
  heightClass?: string
}

/** Horizontal gallery for the event modal — swipe / scroll through same-night flyers. */
export function EventImageGallery({
  imageUrl,
  imageUrls,
  alt,
  className = '',
  heightClass = 'h-40 sm:h-48',
}: GalleryProps) {
  const images = resolveImages(imageUrl, imageUrls)
  const [active, setActive] = useState(0)
  const current = images[Math.min(active, images.length - 1)] || FALLBACK

  if (images.length === 1) {
    return (
      <img
        src={current}
        alt={alt}
        className={`w-full ${heightClass} object-cover rounded-md mb-3 ${className}`}
        onError={(e) => {
          e.currentTarget.src = FALLBACK
        }}
      />
    )
  }

  return (
    <div className={`mb-3 ${className}`}>
      <img
        src={current}
        alt={alt}
        className={`w-full ${heightClass} object-cover rounded-md`}
        onError={(e) => {
          e.currentTarget.src = FALLBACK
        }}
      />
      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-thin">
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Flyer ${i + 1} of ${images.length}`}
            aria-pressed={i === active}
            className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-colors ${
              i === active ? 'border-indigo-400' : 'border-slate-600/60 opacity-80 hover:opacity-100'
            }`}
          >
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = FALLBACK
              }}
            />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        {images.length} flyers from this venue night
      </p>
    </div>
  )
}
