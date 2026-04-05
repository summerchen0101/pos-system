import { Button, List, Modal, Typography } from 'antd'
import { useMemo } from 'react'
import { formatMoney } from '../../lib/money'
import { zhtw } from '../../locales/zhTW'
import { isManualPromotionEligible, isManualPromotionSelectableKind } from '../../pos/manualPromotionEligibility'
import { useCartStore } from '../../store/cartStore'
import type { Product, Promotion } from '../../types/pos'

const { Text } = Typography

function promoOneLine(p: Promotion): string {
  switch (p.kind) {
    case 'FIXED_DISCOUNT':
      return formatMoney(p.fixedDiscountCents ?? 0)
    case 'BUY_X_GET_Y':
      return zhtw.pos.manualPromoBogoLine(p.buyQty ?? 0, p.freeQty ?? 0)
    case 'FREE_ITEMS':
    case 'FREE_PRODUCT':
      return zhtw.pos.manualPromoFreeLine(p.freeQty ?? 1)
    default:
      return p.kind
  }
}

type Props = {
  open: boolean
  onClose: () => void
  promotions: Promotion[]
  products: Product[]
}

export function ManualPromotionApplyModal({ open, onClose, promotions, products }: Props) {
  const lines = useCartStore((s) => s.lines)
  const manualPromotionIds = useCartStore((s) => s.manualPromotionIds)
  const addManualPromotion = useCartStore((s) => s.addManualPromotion)

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

  return (
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
                <Button
                  key="apply"
                  type="primary"
                  size="small"
                  onClick={() => {
                    addManualPromotion(p.id)
                    onClose()
                  }}
                >
                  {zhtw.pos.manualPromoApply}
                </Button>,
              ]}
            >
              <List.Item.Meta title={p.name} description={promoOneLine(p)} />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}
