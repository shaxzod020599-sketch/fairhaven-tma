// Report only progress justified by the existing order and Billz evidence.
const OURS_TO_THEIRS = {
  received: 'NEW', reserved: 'ACCEPTED_BY_RESTAURANT',
  sold: 'DELIVERED', cancelled: 'CANCELLED', failed: 'NEW',
};
function toUzum(status, billz = {}) {
  if (status === 'failed' && billz.reservationApplied === true) return 'ACCEPTED_BY_RESTAURANT';
  return OURS_TO_THEIRS[status] || 'NEW';
}
module.exports = { OURS_TO_THEIRS, toUzum };
