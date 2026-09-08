import { describe, expect, it } from 'vitest';
import { duplicateDraft, emptyProduct, validateProduct } from './productModel';

describe('product editor model', () => {
  it('keeps new Yandex measurement and barcode type missing without adding them to other channels', () => {
    const draft = emptyProduct();
    expect(draft.channels.yandex.measure).toBeNull();
    expect(draft.channels.yandex.barcodeType).toBe('');
    expect(draft.channels.medicalka).not.toHaveProperty('measure');
    expect(draft.channels.uzum).not.toHaveProperty('barcodeType');
  });
  it('rejects incomplete and unsafe catalogue values', () => {
    expect(validateProduct({ name: '', category: '', price: -1, mxikCode: '12x' })).toEqual({
      name: 'Введите название',
      category: 'Выберите категорию',
      price: 'Цена не может быть отрицательной',
      mxikCode: 'ИКПУ содержит от 6 до 20 цифр',
    });
  });

  it('accepts empty IKPU because shop default applies', () => {
    expect(validateProduct({ name: 'OvaBoost', category: 'vitamins', price: 420000, mxikCode: '' })).toEqual({});
  });

  it('clears unique identifiers when duplicating a product', () => {
    const draft = duplicateDraft({
      _id: 'product-1', name: 'OvaBoost', sku: 'FH-01', barcode: '123', billzProductId: 'billz-1', price: 420000,
    });
    expect(draft).toEqual(expect.objectContaining({
      name: 'OvaBoost — копия', sku: '', barcode: '', billzProductId: '', price: 420000,
    }));
    expect(draft._id).toBeUndefined();
  });
});
