import { App, Button, Modal, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { zhtw } from '../../locales/zhTW'
import { freeSelectionLineId } from '../../promotions/freeSelectionLines'
import type { CartLine, Product, Promotion } from '../../types/pos'
import { BundleApplyModal } from './BundleApplyModal'
import { PosQtyNumpadRow } from './PosQtyNumpadRow'

const { Text } = Typography

type BundleQueueItem = { product: Product; count: number }

type BundleConfigureStep = {
  current: Product
  remaining: number
  rest: BundleQueueItem[]
  linesSoFar: CartLine[]
  standardLines: CartLine[]
}

function isBundleEligibleForPool(p: Product): boolean {
  if (p.kind !== 'CUSTOM_BUNDLE') return false
  if (p.stock < 1) return false
  const groups = p.bundleGroups ?? []
  return (
    groups.length >= 1 &&
    groups.every((g) => g.requiredQty >= 1 && g.productIds.length > 0)
  )
}

function initialQtyMap(promotion: Promotion): Record<string, number> {
  const o: Record<string, number> = {}
  for (const pid of promotion.selectableProductIds) o[pid] = 0
  return o
}

type Props = {
  open: boolean
  promotion: Promotion | null
  products: Product[]
  onClose: () => void
  onConfirm: (lines: CartLine[]) => void
}

export function FreeSelectionApplyModal({ open, promotion, products, onClose, onConfirm }: Props) {
  return (
    <Modal
      title={promotion ? zhtw.pos.freeSelectionModalTitle(promotion.name) : ''}
      open={open && promotion != null}
      onCancel={onClose}
      destroyOnClose
      width={520}
      footer={null}
    >
      {promotion ? (
        <FreeSelectionModalContent
          key={promotion.id}
          promotion={promotion}
          products={products}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

type ContentProps = {
  promotion: Promotion
  products: Product[]
  onConfirm: (lines: CartLine[]) => void
  onClose: () => void
}

function FreeSelectionModalContent({ promotion, products, onConfirm, onClose }: ContentProps) {
  const { message } = App.useApp()
  const [qtyByPid, setQtyByPid] = useState(() => initialQtyMap(promotion))
  const [bundleConfigure, setBundleConfigure] = useState<BundleConfigureStep | null>(null)

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const standardCatalog = useMemo(() => products.filter((p) => p.kind === 'STANDARD'), [products])
  const requiredTotal = promotion.maxSelectionQty ?? 0

  const total = useMemo(() => {
    let s = 0
    for (const q of Object.values(qtyByPid)) {
      if (q > 0) s += Math.trunc(q)
    }
    return s
  }, [qtyByPid])

  const isExact = requiredTotal >= 1 && total === requiredTotal

  const setQty = (pid: string, q: number | null) => {
    const v = Math.max(0, Math.trunc(q ?? 0))
    setQtyByPid((prev) => ({ ...prev, [pid]: v }))
  }

  const submit = () => {
    if (requiredTotal < 1) return
    if (total !== requiredTotal) {
      message.error(zhtw.pos.freeSelectionNotExact(requiredTotal))
      return
    }
    const standardLines: CartLine[] = []
    const bundleQueue: BundleQueueItem[] = []

    for (const pid of promotion.selectableProductIds) {
      const q = Math.max(0, Math.trunc(qtyByPid[pid] ?? 0))
      if (q < 1) continue
      const prod = productsById.get(pid)
      if (!prod) continue
      if (q > prod.stock) {
        message.error(zhtw.pos.freeSelectionStock(prod.name))
        return
      }

      if (prod.kind === 'CUSTOM_BUNDLE') {
        if (!isBundleEligibleForPool(prod)) {
          message.error(zhtw.pos.freeSelectionBundleInvalid)
          return
        }
        bundleQueue.push({ product: prod, count: q })
        continue
      }

      standardLines.push({
        lineId: freeSelectionLineId(promotion.id, pid),
        product: { ...prod, price: 0 },
        quantity: q,
        isManualFree: true,
        manualPromotionId: promotion.id,
      })
    }

    const sumStd = standardLines.reduce((a, l) => a + l.quantity, 0)
    const sumBundleSlots = bundleQueue.reduce((a, b) => a + b.count, 0)
    if (sumStd + sumBundleSlots !== requiredTotal) {
      message.error(zhtw.pos.freeSelectionNotExact(requiredTotal))
      return
    }

    if (bundleQueue.length === 0) {
      onConfirm(standardLines)
      return
    }

    const [first, ...rest] = bundleQueue
    setBundleConfigure({
      current: first.product,
      remaining: first.count,
      rest,
      linesSoFar: [],
      standardLines,
    })
  }

  const handleBundleConfigureConfirm = (bundleLines: CartLine[]) => {
    if (!bundleConfigure) return
    const nextSoFar = [...bundleConfigure.linesSoFar, ...bundleLines]
    if (bundleConfigure.remaining > 1) {
      setBundleConfigure({
        ...bundleConfigure,
        remaining: bundleConfigure.remaining - 1,
        linesSoFar: nextSoFar,
      })
      return
    }
    if (bundleConfigure.rest.length === 0) {
      onConfirm([...bundleConfigure.standardLines, ...nextSoFar])
      setBundleConfigure(null)
      return
    }
    const [next, ...r2] = bundleConfigure.rest
    setBundleConfigure({
      current: next.product,
      remaining: next.count,
      rest: r2,
      linesSoFar: nextSoFar,
      standardLines: bundleConfigure.standardLines,
    })
  }

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {zhtw.pos.freeSelectionHint(requiredTotal)}
      </Text>
      <Text strong style={{ display: 'block', marginBottom: 4 }}>
        {zhtw.pos.freeSelectionTotal(total, requiredTotal)}
      </Text>
      {!isExact && requiredTotal >= 1 ? (
        <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          {zhtw.pos.freeSelectionNotExact(requiredTotal)}
        </Text>
      ) : null}
      <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size="middle">
        {promotion.selectableProductIds.map((pid) => {
          const prod = productsById.get(pid)
          if (!prod) return null
          const v = Math.max(0, Math.trunc(qtyByPid[pid] ?? 0))
          const sumOthers = total - v
          const rowMax = Math.min(prod.stock, requiredTotal - sumOthers)
          return (
            <Space
              key={pid}
              style={{ width: '100%', justifyContent: 'space-between' }}
              align="center"
              wrap
            >
              <span style={{ flex: 1, minWidth: 120 }}>
                {prod.name}
                {prod.size ? ` (${prod.size})` : ''}
              </span>
              <PosQtyNumpadRow
                value={v}
                min={0}
                max={Math.max(0, rowMax)}
                numpadTitle={zhtw.pos.numpadQtyTitle}
                onChange={(q) => setQty(pid, q)}
              />
            </Space>
          )
        })}
      </Space>
      <Space style={{ marginTop: 16, justifyContent: 'flex-end', width: '100%' }}>
        <Button onClick={onClose}>{zhtw.common.cancel}</Button>
        <Button type="primary" disabled={!isExact} onClick={submit}>
          {zhtw.pos.manualPromoApply}
        </Button>
      </Space>

      <BundleApplyModal
        open={bundleConfigure != null}
        bundleProduct={bundleConfigure?.current ?? null}
        catalogProducts={standardCatalog}
        manualFreePromotionId={promotion.id}
        configInstanceKey={
          bundleConfigure
            ? `${bundleConfigure.current.id}:${bundleConfigure.linesSoFar.length}`
            : null
        }
        onClose={() => setBundleConfigure(null)}
        onConfirm={handleBundleConfigureConfirm}
      />
    </>
  )
}
