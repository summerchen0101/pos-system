import { isPromotionGroupBehavior, type Promotion, type PromotionGroupBehavior } from '../types/pos'

export function behaviorForGroupId(
  gid: string,
  promotions: readonly Promotion[],
): PromotionGroupBehavior {
  const holder = promotions.find((x) => {
    const id = x.groupId ?? x.group?.id
    return (
      id === gid &&
      x.group != null &&
      isPromotionGroupBehavior(x.group.behavior)
    )
  })
  return holder?.group?.behavior ?? 'stackable'
}
