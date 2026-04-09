import { ImageIcon } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { getProductImageUrl, type ProductImageSize } from '../utils/imageUtils'

export type ProductImageProps = {
  imageUrl: string | null | undefined
  size: ProductImageSize
  style?: CSSProperties
  className?: string
  alt?: string
  /** Append cache-buster query (e.g. after upsert replace). */
  cacheBust?: string | number
}

const placeholderStyle: CSSProperties = {
  background: '#1e1d1b',
  border: '1px dashed #3a3730',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
}

type DisplayProps = {
  src: string | null
  className?: string
  style?: CSSProperties
  alt: string
}

/** Separate keyed subtree so load error state resets when the image identity changes. */
function ProductImageDisplay({ src, className, style, alt }: DisplayProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div style={{ ...placeholderStyle, ...style }}>
        <ImageIcon size={24} color="#4a4845" aria-hidden />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      style={{ objectFit: 'contain', borderRadius: 8, ...style }}
      onError={() => setFailed(true)}
    />
  )
}

export function ProductImage({ imageUrl, size, style, className, alt = '', cacheBust }: ProductImageProps) {
  const baseUrl = getProductImageUrl(imageUrl, size)
  const src =
    baseUrl && cacheBust !== undefined && cacheBust !== null && cacheBust !== ''
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheBust))}`
      : baseUrl

  const remountKey = `${imageUrl ?? ''}\0${size}\0${cacheBust ?? ''}\0${baseUrl ?? ''}`

  return (
    <ProductImageDisplay key={remountKey} src={src} className={className} style={style} alt={alt} />
  )
}
