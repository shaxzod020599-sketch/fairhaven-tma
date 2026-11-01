import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { formatSum, productTitle, useCatalog } from '../../catalog/index.js';
import { Bottle } from '../../components/Icons.jsx';
import Totals from './Totals.jsx';
import './OrderDetails.css';

/**
 * Lines and money of a placed order (confirmation page, account history). The order stores the product
 * name as it was at the time; when the product is still in the catalog its current title, brand and photo
 * are shown instead, in the reader's language.
 */
export default function OrderDetails({ order, className = '' }) {
  const { lang } = useI18n();
  const { byId } = useCatalog();
  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <div className={`crt-od ${className}`}>
      <ul className="crt-od-lines">
        {items.map((item, i) => {
          const raw = item.productId && typeof item.productId === 'object' ? item.productId : null;
          const id = String(raw?._id || item.productId || '');
          const product = byId?.get(id);
          const title = product ? productTitle(product, lang) : raw?.name || item.name || '';
          const image = product?.image || raw?.imageUrl || '';
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          return (
            <li className="crt-od-line" key={`${id}-${i}`}>
              <span className="crt-od-thumb">
                {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Bottle size={22} />}
              </span>
              <span className="crt-od-body">
                {product?.brandName && <span className="crt-od-brand t-mono">{product.brandName}</span>}
                {product ? (
                  <Link to={`/product/${id}`} className="crt-od-title">{title}</Link>
                ) : (
                  <span className="crt-od-title">{title}</span>
                )}
                <span className="crt-od-meta t-num">{qty} × {formatSum(price, lang)}</span>
              </span>
              <span className="crt-od-sum t-price">{formatSum(price * qty, lang)}</span>
            </li>
          );
        })}
      </ul>
      <Totals
        subtotal={Number(order?.subtotal) || 0}
        discount={Number(order?.discount) || 0}
        promoCode={order?.promoCode || ''}
        deliveryFee={Number(order?.deliveryFee) || 0}
        total={Number(order?.totalAmount) || 0}
      />
    </div>
  );
}
