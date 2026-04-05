export {
  aggregateCartLines,
  linesByProductId,
  sumCartSubtotalCents,
} from './aggregate'
export { evaluatePromotionEngine, scorePromotions } from './engine'
export { evaluatePromotionRule } from './registry'
export { cartLineInputsFromPos } from './posAdapter'
export type {
  AggregatedLine,
  BulkDiscountRule,
  BuyXGetYFreeRule,
  CartLineInput,
  PromotionContext,
  PromotionEngineResult,
  PromotionEvaluation,
  PromotionKind,
  PromotionRule,
  SingleProductDiscountRule,
} from './types'
