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
  const maxTotal = promotion.maxSelectionQty ?? 0

  const total = useMemo(() => {
    let s = 0
    for (const q of Object.values(qtyByPid)) {
      if (q > 0) s += Math.trunc(q)
    }
    return s
  }, [qtyByPid])

  const setQty = (pid: string, q: number | null) => {
    const v = Math.max(0, Math.trunc(q ?? 0))
    setQtyByPid((prev) => ({ ...prev, [pid]: v }))
  }

  const submit = () => {
    if (total < 1) {
      message.error(zhtw.pos.freeSelectionNeedQty)
      return
    }
    if (total > maxTotal) {
      message.error(zhtw.pos.freeSelectionOverMax(maxTotal))
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
    if (lines.length === 0) {
      message.error(zhtw.pos.freeSelectionNeedQty)
      return
    }
    onConfirm(lines)
  }

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {zhtw.pos.freeSelectionHint(maxTotal)}
      </Text>
      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        {zhtw.pos.freeSelectionTotal(total, maxTotal)}
      </Text>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {promotion.selectableProductIds.map((pid) => {
          const prod = productsById.get(pid)
          if (!prod) return null
          const v = Math.max(0, Math.trunc(qtyByPid[pid] ?? 0))
          const sumOthers = total - v
          const rowMax = Math.min(prod.stock, maxTotal - sumOthers)
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
        <Button type="primary" onClick={submit}>
          {zhtw.pos.manualPromoApply}
        </Button>
      </Space>
    </>
  )
}
