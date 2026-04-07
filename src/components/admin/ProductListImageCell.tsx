import { CameraOutlined, EditOutlined } from '@ant-design/icons'
import { App, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { setProductImageUrl } from '../../api/productsAdmin'
import {
  PRODUCT_LIST_IMAGE_MAX_BYTES,
  uploadProductListImage,
} from '../../api/productImageStorage'
import { zhtw } from '../../locales/zhTW'
import type { Product } from '../../types/pos'

const p = zhtw.admin.products

type Props = {
  product: Product
  /** 更新列表中的 imageUrl，無需整頁 refetch */
  onImageUrlCommitted: (productId: string, imageUrl: string) => void
}

export function ProductListImageCell({ product, onImageUrlCommitted }: Props) {
  const { message } = App.useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [cacheToken, setCacheToken] = useState(0)

  const rawUrl = product.imageUrl?.trim() || null
  const showPhoto = Boolean(rawUrl && !imgFailed)
  const src =
    showPhoto && rawUrl
      ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}v=${cacheToken}`
      : undefined

  useEffect(() => {
    setImgFailed(false)
  }, [rawUrl, product.id])

  const openPicker = useCallback(() => {
    if (uploading) return
    fileRef.current?.click()
  }, [uploading])

  const onChangeFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return

      if (!file.type.startsWith('image/')) {
        return
      }
      if (file.size > PRODUCT_LIST_IMAGE_MAX_BYTES) {
        message.warning(p.imageInlineMaxSize)
        return
      }

      setUploading(true)
      try {
        const newUrl = await uploadProductListImage(product.id, file, product.imageUrl)
        await setProductImageUrl(product.id, newUrl)
        setCacheToken(Date.now())
        onImageUrlCommitted(product.id, newUrl)
        message.success(p.imageInlineUpdated)
      } catch (err) {
        if (err instanceof Error && err.message === 'IMAGE_TOO_LARGE') {
          message.warning(p.imageInlineMaxSize)
        } else {
          message.error(p.imageInlineUploadFailed)
        }
      } finally {
        setUploading(false)
      }
    },
    [message, onImageUrlCommitted, product.id, product.imageUrl],
  )

  return (
    <div className="admin-product-list-img">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="admin-product-list-img__input"
        aria-label={p.imageInlineChangeAria}
        onChange={(ev) => void onChangeFile(ev)}
      />
      <button
        type="button"
        className="admin-product-list-img__hit"
        onClick={openPicker}
        disabled={uploading}
        aria-label={p.imageInlineChangeAria}>
        <Spin spinning={uploading} size="small">
          <span className="admin-product-list-img__frame">
            {showPhoto && src ? (
              <img
                src={src}
                alt=""
                className="admin-product-list-img__thumb"
                loading="lazy"
                decoding="async"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <span className="admin-product-list-img__placeholder">
                <CameraOutlined className="admin-product-list-img__placeholder-icon" />
              </span>
            )}
            {!uploading ? (
              <span className="admin-product-list-img__overlay" aria-hidden>
                {showPhoto ? <EditOutlined /> : <CameraOutlined />}
              </span>
            ) : null}
          </span>
        </Spin>
      </button>
    </div>
  )
}
