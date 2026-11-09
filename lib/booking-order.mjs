import {assert} from './common/input.mjs';

export const BOOKING_SORT_OPTIONS = [
  {value:'date-asc', label:'대여 날짜 · 빠른 순'},
  {value:'date-desc', label:'대여 날짜 · 늦은 순'},
  {value:'created-asc', label:'신청 시각 · 오래된 순'},
  {value:'created-desc', label:'신청 시각 · 최신 순'}
];

// SQL fragments are selected only from this fixed allowlist, before LIMIT is applied.
export function bookingOrder(value = 'date-asc') {
  const orders = {
    'date-asc':'b.date ASC,b.start ASC,b.id ASC',
    'date-desc':'b.date DESC,b.start DESC,b.id ASC',
    'created-asc':'b.created_at ASC,b.date ASC,b.start ASC,b.id ASC',
    'created-desc':'b.created_at DESC,b.date ASC,b.start ASC,b.id ASC'
  };
  assert(typeof value === 'string' && Object.hasOwn(orders,value), '예약 정렬 기준을 확인해주세요.');
  return orders[value];
}

export function bookingCreatedAt(value) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) ? new Date(stamp + 9 * 3600000).toISOString().slice(0,19).replace('T',' ') : '기록 없음';
}
