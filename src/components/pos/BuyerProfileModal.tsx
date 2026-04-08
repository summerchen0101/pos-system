import { Button, Modal, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { BuyerAgeGroup, BuyerGender, BuyerMotivation } from '../../types/order'
import { zhtw } from '../../locales/zhTW'

const p = zhtw.pos.buyerProfile
const { Text } = Typography

type Props = {
  open: boolean
  loading: boolean
  onSkip: () => void
  onSubmit: (patch: {
    buyerGender: BuyerGender | null
    buyerAgeGroup: BuyerAgeGroup | null
    buyerMotivation: BuyerMotivation | null
  }) => void
}

type Option<T extends string> = { value: T; label: string }

function OptionButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null
  options: Option<T>[]
  onChange: (v: T | null) => void
}) {
  return (
    <div className="pos-buyer-profile__group">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className={`pos-buyer-profile__chip ${active ? 'is-active' : ''}`}
            onClick={() => onChange(active ? null : opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function BuyerProfileModal({ open, loading, onSkip, onSubmit }: Props) {
  const [buyerGender, setBuyerGender] = useState<BuyerGender | null>(null)
  const [buyerAgeGroup, setBuyerAgeGroup] = useState<BuyerAgeGroup | null>(null)
  const [buyerMotivation, setBuyerMotivation] = useState<BuyerMotivation | null>(null)

  const genderOptions = useMemo<Option<BuyerGender>[]>(
    () => [
      { value: 'male', label: p.genderMale },
      { value: 'female', label: p.genderFemale },
      { value: 'other', label: p.genderOther },
    ],
    [],
  )
  const ageOptions = useMemo<Option<BuyerAgeGroup>[]>(
    () => [
      { value: 'under_18', label: p.ageUnder18 },
      { value: '18_24', label: p.age18to24 },
      { value: '25_34', label: p.age25to34 },
      { value: '35_44', label: p.age35to44 },
      { value: '45_54', label: p.age45to54 },
      { value: '55_above', label: p.age55Above },
    ],
    [],
  )
  const motivationOptions = useMemo<Option<BuyerMotivation>[]>(
    () => [
      { value: 'self_use', label: p.motivationSelfUse },
      { value: 'gift', label: p.motivationGift },
      { value: 'trial', label: p.motivationTrial },
      { value: 'repurchase', label: p.motivationRepurchase },
      { value: 'other', label: p.motivationOther },
    ],
    [],
  )

  return (
    <Modal
      open={open}
      title={p.title}
      onCancel={onSkip}
      footer={null}
      maskClosable={false}
      closable={false}
      destroyOnClose
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <Text strong>{p.genderLabel}</Text>
          <OptionButtons value={buyerGender} options={genderOptions} onChange={setBuyerGender} />
        </div>
        <div>
          <Text strong>{p.ageLabel}</Text>
          <OptionButtons value={buyerAgeGroup} options={ageOptions} onChange={setBuyerAgeGroup} />
        </div>
        <div>
          <Text strong>{p.motivationLabel}</Text>
          <OptionButtons value={buyerMotivation} options={motivationOptions} onChange={setBuyerMotivation} />
        </div>
        <div className="pos-buyer-profile__actions">
          <Button onClick={onSkip} disabled={loading}>
            {p.skip}
          </Button>
          <Button
            type="primary"
            loading={loading}
            onClick={() =>
              onSubmit({
                buyerGender,
                buyerAgeGroup,
                buyerMotivation,
              })
            }
          >
            {p.submit}
          </Button>
        </div>
      </Space>
    </Modal>
  )
}
