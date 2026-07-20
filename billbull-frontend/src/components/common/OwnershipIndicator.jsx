import React from 'react';
import { usePermissions } from '../../context/PermissionContext';

/**
 * User-Based Data Visibility (Ownership Filtering) UI helpers.
 *
 * The backend narrows transaction lists to the current user's own records when the tenant toggle
 * `ownership.filtering.enabled` is on and the user lacks the VIEW_ALL_RECORDS override. These
 * components make that legible so a restricted user does not think a colleague's document is
 * "missing" — the design's UX-clarity requirement (docs §7). Both render nothing unless the tenant
 * toggle is on, so they are invisible (and safe to place anywhere) for every tenant that has not
 * enabled the feature.
 */

/**
 * Banner shown above a transaction list when the current user is ownership-restricted:
 * "Showing only records you created." Renders nothing for override-holders or when the toggle is
 * off — so it can be dropped into any list page unconditionally.
 */
export function OwnershipIndicator({ className = '', label = 'records you created' }) {
  const { isOwnershipRestricted } = usePermissions();
  if (!isOwnershipRestricted) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-[#FDE6A9] bg-[#FFF8E7] px-3 py-1.5 text-xs text-amber-900 ${className}`}
      role="status"
      title="Ownership filtering is enabled for your account. Ask an administrator for the 'View all records' permission to see everyone's records."
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="shrink-0">
        <path fillRule="evenodd" d="M10 2a4 4 0 100 8 4 4 0 000-8zM4 16a6 6 0 1112 0v1H4v-1z" clipRule="evenodd" />
      </svg>
      <span>Showing only {label}.</span>
    </div>
  );
}

/**
 * My/All records switch for VIEW_ALL_RECORDS holders (managers/admins). Controlled: pass the current
 * `scope` ('mine' | 'all') and an `onChange(next)` handler; the list page forwards the value to the
 * API as `?ownerScope=`. Renders nothing for users without the override (they are always 'mine'),
 * and nothing when the toggle is off.
 */
export function OwnershipScopeToggle({ scope = 'all', onChange, className = '' }) {
  const { canViewAllRecords } = usePermissions();
  if (!canViewAllRecords) return null;

  return (
    <div className={`inline-flex overflow-hidden rounded-md border border-[#FDE6A9] text-xs ${className}`}>
      {[
        { key: 'mine', text: 'My records' },
        { key: 'all', text: 'All records' },
      ].map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange && onChange(opt.key)}
          className={
            scope === opt.key
              ? 'bg-[#F5C742] px-3 py-1 font-medium text-amber-950'
              : 'bg-white px-3 py-1 text-gray-600 hover:bg-[#FFF8E7]'
          }
          aria-pressed={scope === opt.key}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}

export default OwnershipIndicator;
