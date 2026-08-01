/**
 * Order status vocabulary, translated in both directions.
 *
 * Uzum inherits the Yandex Eats state machine:
 *
 *   NEW → ACCEPTED_BY_RESTAURANT → COOKING → READY → TAKEN_BY_COURIER → DELIVERED
 *
 * with CANCELLED reachable from anywhere and POSTPONED from any non-terminal
 * state. Our own record has five states, because the only distinctions that
 * change stock are: recorded, held in Billz, sold, released.
 *
 * The mapping is deliberately lossy in one direction and strict in the other.
 * We report the furthest state our record can justify — never further — because
 * Uzum drives its own courier flow off what we say. Claiming READY for an order
 * whose reservation failed would have a courier arrive at a shop with nothing
 * to collect.
 */

// What we tell Uzum when they poll.
const OURS_TO_THEIRS = {
  // Accepted and recorded, but Billz has not confirmed the stock yet. Uzum
  // gives us 15 minutes from here before it cancels — which is the right
  // outcome if the reservation genuinely cannot be made.
  received: 'NEW',
  // Stock is held. This is the acknowledgement their deadline is waiting for.
  reserved: 'ACCEPTED_BY_RESTAURANT',
  sold: 'DELIVERED',
  cancelled: 'CANCELLED',
  // A Billz step failed. Still NEW rather than CANCELLED: an operator may fix
  // it inside the window, and if nobody does, Uzum's own timeout cancels it —
  // which is more honest than us claiming a cancellation we did not decide.
  failed: 'NEW',
};

// What an incoming status change means for stock.
const THEIRS_TO_ACTION = {
  DELIVERED: 'sell',
  CANCELLED: 'cancel',
  // Acknowledgements. The reservation is already made when the order arrives,
  // so these change nothing on our side.
  NEW: null,
  ACCEPTED_BY_RESTAURANT: null,
  COOKING: null,
  READY: null,
  TAKEN_BY_COURIER: null,
  POSTPONED: null,
};

const KNOWN_STATUSES = Object.keys(THEIRS_TO_ACTION);

function toUzum(status) {
  return OURS_TO_THEIRS[status] || 'NEW';
}

/**
 * Returns `{ action }` for a status we understand, or `{ error }` for one we do
 * not. An unknown status must not be silently treated as an acknowledgement:
 * that would swallow a real state change.
 */
function actionFor(status) {
  const normalised = String(status || '').trim().toUpperCase();
  if (!KNOWN_STATUSES.includes(normalised)) {
    return { error: `unknown status "${status}"` };
  }
  return { action: THEIRS_TO_ACTION[normalised] };
}

module.exports = { KNOWN_STATUSES, OURS_TO_THEIRS, THEIRS_TO_ACTION, actionFor, toUzum };
