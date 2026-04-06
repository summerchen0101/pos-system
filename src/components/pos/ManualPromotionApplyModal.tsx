import { Button, List, Modal, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { formatMoney } from '../../lib/money'
import { zhtw } from '../../locales/zhTW'
import { isManualPromotionEligible, isManualPromotionSelectableKind } from '../../pos/manualPromotionEligibility'
import { useCartStore } from '../../store/cartStore'
import type { CartLine, Product, Promotion } from '../../types/pos'
import { FreeSelectionApplyModal } from './FreeSelectionApplyModal'

const { Text } = Typography

function manualFreePromoDescription(p: Promotion, products: readonly Product[]): string {
  if (!p.freeItems.length) return zhtw.pos.manualPromoFreeLine(0)
  const byId = new Map(products.map((x) => [x.id, x]))
  return p.freeItems
    .map((f) => `${byId.get(f.productId)?.name ?? '—'}×${f.quantity}`)
    .join('、')
}

function promoOneLine(p: Promotion, products: readonly Product[]): string {
  switch (p.kind) {
    case 'FIXED_DISCOUNT':
      return formatMoney(p.fixedDiscountCents ?? 0)
    case 'BUY_X_GET_Y':
      return (
        zhtw.pos.manualPromoBogoLine(p.buyQty ?? 0, p.freeQty ?? 0) +
        (p.bogoSingleDealOnly ? zhtw.pos.manualPromoBogoSingleSuffix : '')
      )
    case 'FREE_ITEMS':
      return manualFreePromoDescription(p, products)
    case 'FREE_SELECTION':
      return zhtw.pos.manualPromoFreeSelection(p.selectableProductIds.length, p.maxSelectionQty ?? 0)
    default:
      return p.kind
  }
}

type Props = {
  open: boolean
  onClose: () => void
  promotions: Promotion[]
  products: Product[]
  onApplyFreeSelection: (promotionId: string, lines: CartLine[]) => void
}

export function ManualPromotionApplyModal({
  open,
  onClose,
  promotions,
  products,
  onApplyFreeSelection,
}: Props) {
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const addManualPromotion = useCartStore((s) => s.addManualPromotion)

  const [freeSelectionPromo, setFreeSelectionPromo] = useState<Promotion | null>(null)

  const candidates = useMemo(() => {
    return promotions.filter(
      (p) =>
        p.active &&
        p.applyMode === 'MANUAL' &&
        isManualPromotionSelectableKind(p) &&
        !manualPromotionIds.includes(p.id) &&
        isManualPromotionEligible(p, lines, products),
    )
  }, [promotions, lines, products, manualPromotionIds])

  const handleApply = (p: Promotion) => {
    if (p.kind === 'FREE_SELECTION') {
      setFreeSelectionPromo(p)
      return
    }
    addManualPromotion(p.id)
    onClose()
  }

  return (
    <>
      <Modal
        title={zhtw.pos.manualPromoModalTitle}
        open={open}
        onCancel={onClose}
        footer={null}
        destroyOnClose
        width={480}
      >
        {candidates.length === 0 ? (
          <Text type="secondary">{zhtw.pos.manualPromoEmpty}</Text>
        ) : (
          <List
            dataSource={candidates}
            renderItem={(p) => (
              <List.Item
                actions={[
                  <Button key="apply" type="primary" size="small" onClick={() => handleApply(p)}>
                    {zhtw.pos.manualPromoApply}
                  </Button>,
                ]}
              >
                <List.Item.Meta title={p.name} description={promoOneLine(p, products)} />
              </List.Item>
            )}
          />
        )}
      </Modal>

      <FreeSelectionApplyModal
        open={freeSelectionPromo != null}
        promotion={freeSelectionPromo}
        products={products}
        onClose={() => setFreeSelectionPromo(null)}
        onConfirm={(cartLines) => {
          if (!freeSelectionPromo) return
          onApplyFreeSelection(freeSelectionPromo.id, cartLines)
          setFreeSelectionPromo(null)
          onClose()
        }}
      />
    </>
  )
}
