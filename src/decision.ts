import type { ApplicationMeta } from './types.js';

// Statuses that record a final outcome for the application. Matched with word
// boundaries so live statuses such as "Awaiting decision", "Undecided" or
// "Pending Consideration" are never treated as resolved.
const RESOLVED_STATUS =
  /\b(decided|determined|approved|permitted|granted|refused|rejected|withdrawn|dismissed|allowed)\b/i;

const EMPTY_DECISION = /^(\s|-|n\/?a|not available|no data)*$/i;

export function isAwaitingDecision(
  app: Pick<ApplicationMeta, 'status' | 'furtherInformation'>
): boolean {
  const status = (app.status || '').trim();
  if (RESOLVED_STATUS.test(status)) return false;
  const decision = (app.furtherInformation?.['Decision'] || '').trim();
  return EMPTY_DECISION.test(decision);
}

export interface SyncScope {
  // Re-sync every non-archived application, ignoring the criteria below.
  all?: boolean;
  // Optional filters applied when `all` is not set. When more than one is
  // given, an application must match all of them.
  starred?: boolean;
  awaitingDecision?: boolean;
}

// Bulk-sync scopes operate on the applications being tracked on the main page,
// so archived ones are always excluded (they can be synced individually from
// the Archived page instead).
export function selectSyncApps(apps: ApplicationMeta[], scope: SyncScope): ApplicationMeta[] {
  const active = apps.filter((a) => !a.archived);
  if (scope.all) return active;
  const starred = !!scope.starred;
  const awaitingDecision = !!scope.awaitingDecision;
  // An empty scope selects nothing, so a buggy/empty request can never
  // accidentally enqueue the whole library.
  if (!starred && !awaitingDecision) return [];
  return active.filter(
    (a) => (!starred || !!a.starred) && (!awaitingDecision || isAwaitingDecision(a))
  );
}
