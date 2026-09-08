// Report only progress justified by the existing order and Billz evidence.
const OURS_TO_THEIRS = {
  received: 'NEW', reserved: 'ACCEPTED_BY_RESTAURANT',
  sold: 'READY', cancelled: 'CANCELLED', failed: 'NEW',
};
function toUzum(status, billz = {}, uzum = {}) {
  if (uzum.version === 1 && ['reserved', 'failed'].includes(status) && !uzum.acceptedAt) return 'NEW';
  if (status === 'failed' && billz.reservationApplied === true) return 'ACCEPTED_BY_RESTAURANT';
  return OURS_TO_THEIRS[status] || 'NEW';
}
module.exports = { OURS_TO_THEIRS, toUzum };
