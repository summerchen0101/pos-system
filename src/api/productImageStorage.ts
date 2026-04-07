import { supabase } from '../supabase'

export const PRODUCT_IMAGES_BUCKET = 'product-images'

const MAX_BYTES = 5 * 1024 * 1024

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

export function publicUrlForProductImagePath(path: string): string {
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error('Image too large (max 5MB)')
  }
  const extRaw = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extRaw) ? extRaw : 'jpg'
  const path = `${productId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return publicUrlForProductImagePath(path)
}

/** Remove object at URL (ignore if path cannot be parsed). */
export async function removeProductImageFromUrl(url: string | null | undefined): Promise<void> {
  if (!url?.trim()) return
  const path = pathFromProductImagePublicUrl(url.trim())
  if (!path) return
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path])
  if (error) throw error
}
