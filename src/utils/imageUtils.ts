import {
  PRODUCT_IMAGES_BUCKET,
  bucketRelativePathFromImageRef,
} from '../api/productImageStorage'
import { supabase } from '../supabase'

export type ProductImageSize = 'thumb' | 'card' | 'full'

/**
 * Resolves a display URL for `products.image_url`.
 *
 * - Stored **direct** public object URLs (`.../object/public/product-images/...`) are used as-is.
 *   Passing them through `getPublicUrl(..., { transform })` would switch to the Image Transformation
 *   endpoint (`/render/...`), which returns nothing if that feature is off on the Supabase project.
 * - Relative keys use `getPublicUrl(path)` without transforms for the same reason.
 *
 * `size` is kept for call-site compatibility; sizing can be reintroduced behind a feature flag when
 * Storage image transforms are enabled on the project.
 */
export function getProductImageUrl(
  imageUrl: string | null | undefined,
  _size: ProductImageSize = 'card',
): string | null {
  if (!imageUrl?.trim()) return null

  const raw = imageUrl.trim()
  const isHttp = raw.startsWith('http://') || raw.startsWith('https://')

  if (isHttp && raw.includes(`/object/public/${PRODUCT_IMAGES_BUCKET}/`)) {
    return raw.split('?')[0] ?? raw
  }

  const path = bucketRelativePathFromImageRef(raw)

  if (!path) {
    return isHttp ? raw.split('?')[0] ?? raw : null
  }

  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
}
