export const CURRENCY_SYMBOL = '$';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXPORT_BATCH_SIZE = 1000;

export const MOVEMENT_LABEL: Record<string, string> = {
  STOCK_IN: 'ទំនិញចូល',
  STOCK_OUT: 'ទំនិញចេញ',
  ADJUSTMENT: 'កែសម្រួល',
};
export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'សកម្ម',
  INACTIVE: 'មិនសកម្ម',
};
export const UNIT_LABEL: Record<string, string> = {
  PIECE: 'ដុំ',
  BOX: 'ប្រអប់',
  SET: 'ឈុត',
  PACK: 'កញ្ចប់',
  CARTON: 'កាតុង',
  KG: 'គីឡូ',
  OTHER: 'ផ្សេងៗ',
};
