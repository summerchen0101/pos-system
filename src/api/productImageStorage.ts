import { supabase } from '../supabase'

export const PRODUCT_IMAGES_BUCKET = 'product-images'

const MAX_BYTES = 5 * 1024 * 1024

/** 列表直行上傳上限（與 modal 的 5MB 分開） */
export const PRODUCT_LIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024

/** Extract storage path from public URL for this bucket. */
export function pathFromProductImagePublicUrl(url: string): string | null {
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const rest = url.slice(i + marker.length).split('?')[0]
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * Bucket-relative object key for `product-images` (e.g. `uuid/file.jpg`).
 * Accepts stored path, legacy `/object/public/...` URL, or `/render/image/public/...` URL.
 */
export function bucketRelativePathFromImageRef(ref: string | null | undefined): string | null {
  if (!ref?.trim()) return null
  const s = ref.trim()

  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    const p = s.replace(/^\/+/, '')
    if (p.startsWith(`${PRODUCT_IMAGES_BUCKET}/`)) {
      return p.slice(PRODUCT_IMAGES_BUCKET.length + 1)
    }
    return p
  }

  const fromObject = pathFromProductImagePublicUrl(s)
  if (fromObject) return fromObject

  const renderPub = '/render/image/public/'
  const ri = s.indexOf(renderPub)
  if (ri !== -1) {
    const seg = s.slice(ri + renderPub.length).split('?')[0]
    try {
      const full = decodeURIComponent(seg)
      if (full.startsWith(`${PRODUCT_IMAGES_BUCKET}/`)) {
        return full.slice(PRODUCT_IMAGES_BUCKET.length + 1)
      }
      return full
    } catch {
      return null
    }
  }

  const idx = s.indexOf(`/${PRODUCT_IMAGES_BUCKET}/`)
  if (idx !== -1) {
    try {
      return decodeURIComponent(s.slice(idx + PRODUCT_IMAGES_BUCKET.length + 2).split('?')[0])
    } catch {
      return s.slice(idx + PRODUCT_IMAGES_BUCKET.length + 2).split('?')[0]
    }
  }

  return null
}

export function publicUrlForProductImagePath(path: string): string {
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function normalizeImageExt(file: File): string {
  const extRaw = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extRaw) ? extRaw : 'jpg'
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error('Image too large (max 5MB)')
  }
  const ext = normalizeImageExt(file)
  const path = `${productId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return path
}

/**
 * 後台列表直行上傳：路徑 `{productId}/{productId}.{ext}` + upsert，避免舊 uuid 檔堆積。
 * 成功後若舊檔路徑不同則刪除舊檔。
 */
export async function uploadProductListImage(
  productId: string,
  file: File,
  previousPublicUrl: string | null | undefined,
): Promise<string> {
  if (file.size > PRODUCT_LIST_IMAGE_MAX_BYTES) {
    throw new Error('IMAGE_TOO_LARGE')
  }
  const ext = normalizeImageExt(file)
  const path = `${productId}/${productId}.${ext}`

  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) throw error

  const prevPath = previousPublicUrl?.trim() ? bucketRelativePathFromImageRef(previousPublicUrl.trim()) : null
  if (prevPath && prevPath !== path) {
    const { error: rmErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([prevPath])
    if (rmErr) {
      console.warn('remove previous product list image:', rmErr.message)
    }
  }

  return path
}

/** Remove object at stored path or legacy public URL (ignore if path cannot be resolved). */
export async function removeProductImageFromUrl(url: string | null | undefined): Promise<void> {
  if (!url?.trim()) return
  const path = bucketRelativePathFromImageRef(url.trim())
  if (!path) return
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path])
  if (error) throw error
}
