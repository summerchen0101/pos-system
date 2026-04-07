import { App, Button, Divider, Modal, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { zhtw } from '../../locales/zhTW'
import { bundleComponentLineId, bundleRootLineId } from '../../pos/bundleCart'
import type { CartLine, Product, ProductBundleGroup } from '../../types/pos'
import { PosQtyNumpadRow } from './PosQtyNumpadRow'

const { Text } = Typography

function initialQtyByGroup(groups: ProductBundleGroup[]): Record<string, Record<string, number>> {
  const o: Record<string, Record<string, number>> = {}
  for (const g of groups) {
    o[g.id] = {}
    for (const pid of g.productIds) o[g.id][pid] = 0
  }
  return o
}

type Props = {
  open: boolean
  bundleProduct: Product | null
  catalogProducts: Product[]
  onClose: () => void
  onConfirm: (lines: CartLine[]) => void
  /** When set, lines are $0 manual-free rows for this FREE_SELECTION / manual promotion. */
  manualFreePromotionId?: string | null
  /** Bump to reset internal group qty state (e.g. configuring another instance of the same bundle). */
  configInstanceKey?: string | null
}

export function BundleApplyModal({
  open,
  bundleProduct,
  catalogProducts,
  onClose,
  onConfirm,
  manualFreePromotionId = null,
  configInstanceKey = null,
}: Props) {
  return (
    <Modal
      title={bundleProduct ? zhtw.pos.bundleModalTitle(bundleProduct.name) : ''}
      open={open && bundleProduct != null}
      onCancel={onClose}
      destroyOnClose
      width={640}
      footer={null}>
      {bundleProduct ? (
        <BundleModalContent
          key={configInstanceKey ?? bundleProduct.id}
          bundleProduct={bundleProduct}
          catalogProducts={catalogProducts}
          manualFreePromotionId={manualFreePromotionId}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  )
}

type ContentProps = {
  bundleProduct: Product
  catalogProducts: Product[]
  manualFreePromotionId: string | null
  onConfirm: (lines: CartLine[]) => void
  onClose: () => void
}

function groupTotal(qtyByPid: Record<string, number>): number {
  let s = 0
  for (const q of Object.values(qtyByPid)) {
    if (q > 0) s += Math.trunc(q)
  }
  return s
}

function BundleModalContent({
  bundleProduct,
  catalogProducts,
  manualFreePromotionId,
  onConfirm,
  onClose,
}: ContentProps) {
  const { message } = App.useApp()
  const groups = useMemo(
    () => [...bundleProduct.bundleGroups].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [bundleProduct],
  )
  const [qtyByGroupPid, setQtyByGroupPid] = useState(() => initialQtyByGroup(groups))

  const productsById = useMemo(
    () => new Map(catalogProducts.map((p) => [p.id, p])),
    [catalogProducts],
  )

  const perGroupTotals = useMemo(() => {
    const m: Record<string, { cur: number; req: number; exact: boolean }> = {}
    for (const g of groups) {
      const cur = groupTotal(qtyByGroupPid[g.id] ?? {})
      const req = g.requiredQty
      m[g.id] = { cur, req, exact: req >= 1 && cur === req }
    }
    return m
  }, [groups, qtyByGroupPid])

  const allExact = groups.length > 0 && groups.every((g) => perGroupTotals[g.id]?.exact)

  const setQty = (groupId: string, pid: string, q: number | null) => {
    const v = Math.max(0, Math.trunc(q ?? 0))
    setQtyByGroupPid((prev) => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [pid]: v },
    }))
  }

  const submit = () => {
    if (groups.length === 0) return
    for (const g of groups) {
      const t = perGroupTotals[g.id]
      if (!t || t.cur !== t.req) {
        message.error(zhtw.pos.bundleGroupNotExact(g.name, g.requiredQty))
        return
      }
    }
    const instanceId = crypto.randomUUID()
    const promoId = manualFreePromotionId
    const rootLine: CartLine = {
      lineId: bundleRootLineId(instanceId),
      product: promoId ? { ...bundleProduct, price: 0 } : bundleProduct,
      quantity: 1,
      isBundleRoot: true,
      bundleInstanceId: instanceId,
      ...(promoId ? { isManualFree: true as const, manualPromotionId: promoId } : {}),
    }
    const componentLines: CartLine[] = []
    for (const g of groups) {
      const map = qtyByGroupPid[g.id] ?? {}
      for (const rowPid of g.productIds) {
        const q = Math.max(0, Math.trunc(map[rowPid] ?? 0))
        if (q < 1) continue
        const prod = productsById.get(rowPid)
        if (!prod) continue
        if (q > prod.stock) {
          message.error(zhtw.pos.bundleStockInsufficient(prod.name))
          return
        }
        componentLines.push({
          lineId: bundleComponentLineId(instanceId, g.id, rowPid),
          product: promoId ? { ...prod, price: 0 } : prod,
          quantity: q,
          isBundleComponent: true,
          bundleInstanceId: instanceId,
          bundleRootProductId: bundleProduct.id,
          bundleGroupId: g.id,
          ...(promoId ? { isManualFree: true as const, manualPromotionId: promoId } : {}),
        })
      }
    }
    for (const g of groups) {
      const sum = componentLines
        .filter((l) => l.bundleGroupId === g.id)
        .reduce((a, l) => a + l.quantity, 0)
      if (sum !== g.requiredQty) {
        message.error(zhtw.pos.bundleGroupNotExact(g.name, g.requiredQty))
        return
      }
    }
    onConfirm([rootLine, ...componentLines])
  }

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {zhtw.pos.bundleHint}
      </Text>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {groups.map((g) => {
          const t = perGroupTotals[g.id]
          const req = g.requiredQty
          const cur = t?.cur ?? 0
          const exact = t?.exact ?? false
          const qtyMap = qtyByGroupPid[g.id] ?? {}
          return (
            <div key={g.id}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                {g.name}
              </Text>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {zhtw.pos.bundleGroupProgress(cur, req)}
              </Text>
              {!exact && req >= 1 ? (
                <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
                  {zhtw.pos.bundleGroupNotExact(g.name, req)}
                </Text>
              ) : null}
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                {g.productIds.map((rowPid) => {
                  const prod = productsById.get(rowPid)
                  if (!prod) return null
                  const v = Math.max(0, Math.trunc(qtyMap[rowPid] ?? 0))
                  const sumOthers = cur - v
                  const rowMaxByTotal = Math.max(0, req - sumOthers)
                  const rowMax = Math.min(prod.stock, rowMaxByTotal)
                  return (
                    <Space
                      key={rowPid}
                      style={{ width: '100%', justifyContent: 'space-between' }}
                      align="center"
                      wrap>
                      <span style={{ flex: 1, minWidth: 120 }}>
                        {prod.name}
                        {prod.size ? ` (${prod.size})` : ''}
                      </span>
                      <PosQtyNumpadRow
                        value={v}
                        min={0}
                        max={Math.max(0, rowMax)}
                        numpadTitle={zhtw.pos.numpadQtyTitle}
                        onChange={(q) => setQty(g.id, rowPid, q)}
                      />
                    </Space>
                  )
                })}
              </Space>
              <Divider style={{ margin: '12px 0' }} />
            </div>
          )
        })}
      </Space>
      <Space style={{ marginTop: 8, justifyContent: 'flex-end', width: '100%' }}>
        <Button onClick={onClose}>{zhtw.common.cancel}</Button>
        <Button type="primary" disabled={!allExact} onClick={submit}>
          {zhtw.pos.bundleConfirm}
        </Button>
      </Space>
    </>
  )
}
