import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { zhtw } from '../../locales/zhTW'
import { formatMoney } from '../../lib/money'
import type { AppliedDiscount } from '../../promotions/buildAppliedDiscounts'

type Props = {
  open: boolean
  onClose: () => void
  items: AppliedDiscount[]
  totalDiscountCents: number
}

const t = zhtw.pos

export function DiscountDetailModal({ open, onClose, items, totalDiscountCents }: Props) {
  return (
    <Modal
      title={t.discountDetailTitle}
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" block onClick={onClose}>
          {t.discountDetailClose}
        </Button>
      }
      width={480}
      rootClassName="pos-discount-detail-modal"
      styles={{ body: { paddingTop: 12 } }}
      destroyOnClose
      centered>
      <div className="pos-discount-detail-modal__body">
        <ul className="pos-discount-detail-modal__list">
          {items.map((row) => (
            <li key={row.promotionId} className="pos-discount-detail-modal__item">
              <div className="pos-discount-detail-modal__item-title">
                <CheckCircleOutlined className="pos-discount-detail-modal__check" aria-hidden />
                <span>{row.name}</span>
              </div>
              <div className="pos-discount-detail-modal__desc">{row.description}</div>
              {row.gifts && row.gifts.length > 0 ? (
                <ul className="pos-discount-detail-modal__gifts">
                  {row.gifts.map((g, gi) => (
                    <li key={`${row.promotionId}-g-${gi}`}>{t.discountDetailGiftLine(g.name, g.quantity)}</li>
                  ))}
                </ul>
              ) : null}
              {row.discountCents > 0 ? (
                <div className="pos-discount-detail-modal__deduction">
                  {t.discountDetailDeduction(`−${formatMoney(row.discountCents)}`)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="pos-discount-detail-modal__total">
          <span>{t.discountDetailTotalLabel}</span>
          <span className="pos-discount-detail-modal__total-amount">
            {totalDiscountCents > 0 ? `−${formatMoney(totalDiscountCents)}` : formatMoney(0)}
          </span>
        </div>
      </div>
    </Modal>
  )
}
