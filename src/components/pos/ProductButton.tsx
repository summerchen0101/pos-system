import { zhtw } from "../../locales/zhTW";
import type { Product } from "../../types/pos";
import { formatMoney } from "../../lib/money";
import { ProductImage } from "../ProductImage";

type Props = {
  product: Product;
  onAdd: (product: Product) => void;
};

export function ProductButton({ product, onAdd }: Props) {
  const soldOut = product.stock <= 0;

  return (
    <button
      type="button"
      className="pos-product-btn"
      disabled={soldOut}
      onClick={() => onAdd(product)}
      aria-label={
        soldOut
          ? zhtw.pos.productSoldOutAria(product.name)
          : `${product.name}，${zhtw.pos.stockLabel} ${product.stock}`
      }>
      <div className="pos-product-btn__media" aria-hidden>
        <ProductImage
          imageUrl={product.imageUrl}
          size="card"
          className="pos-product-btn__img"
          style={{ width: "90%", height: "90%", borderRadius: 8 }}
        />
      </div>
      <div className="pos-product-btn__body">
        <span className="pos-product-btn__name">
          {product.name}
          {product.size ? ` (${product.size})` : ""}
        </span>
        <span className="pos-product-btn__price">
          {formatMoney(product.price)}
        </span>
        <span className="pos-product-btn__stock">
          {soldOut ? zhtw.pos.soldOut : zhtw.pos.stockCount(product.stock)}
        </span>
      </div>
    </button>
  );
}
