import { App, Button, InputNumber, Modal, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { zhtw } from '../../locales/zhTW'
import { freeSelectionLineId } from '../../promotions/freeSelectionLines'
import type { CartLine, Product, Promotion } from '../../types/pos'

const { Text } = Typography

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

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
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
    const lines: CartLine[] = []
    for (const pid of promotion.selectableProductIds) {
      const q = Math.max(0, Math.trunc(qtyByPid[pid] ?? 0))
      if (q < 1) continue
      const prod = productsById.get(pid)
      if (!prod) continue
      if (q > prod.stock) {
        message.error(zhtw.pos.freeSelectionStock(prod.name))
        return
      }
      lines.push({
        lineId: freeSelectionLineId(promotion.id, pid),
        product: { ...prod, price: 0 },
        quantity: q,
        isManualFree: true,
        manualPromotionId: promotion.id,
      })
    }
    if (lines.reduce((a, l) => a + l.quantity, 0) !== requiredTotal) {
      message.error(zhtw.pos.freeSelectionNotExact(requiredTotal))
      return
    }
    onConfirm(lines)
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
              <InputNumber min={0} max={Math.max(0, rowMax)} value={v} onChange={(x) => setQty(pid, x)} />
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
    </>
  )
}
