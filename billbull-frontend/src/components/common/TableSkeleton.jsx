import React from 'react';

/**
 * Drop-in skeleton rows for any <tbody> while data is loading.
 * Usage:
 *   <tbody>
 *     {isLoading && <TableSkeleton cols={8} rows={8} />}
 *     {!isLoading && data.map(...)}
 *   </tbody>
 *
 * Each row pulses with randomised-width cells so columns feel natural.
 */
const WIDTHS = [
    ['w-8', 'w-24', 'w-20', 'w-28', 'w-20', 'w-16', 'w-20', 'w-14', 'w-14', 'w-20', 'w-12', 'w-20'],
    ['w-6', 'w-28', 'w-18', 'w-24', 'w-16', 'w-20', 'w-14', 'w-16', 'w-12', 'w-18', 'w-16', 'w-16'],
    ['w-8', 'w-20', 'w-24', 'w-32', 'w-20', 'w-14', 'w-18', 'w-12', 'w-16', 'w-16', 'w-12', 'w-18'],
    ['w-6', 'w-24', 'w-20', 'w-28', 'w-14', 'w-18', 'w-16', 'w-14', 'w-12', 'w-20', 'w-16', 'w-14'],
    ['w-8', 'w-28', 'w-16', 'w-24', 'w-18', 'w-16', 'w-20', 'w-16', 'w-14', 'w-18', 'w-12', 'w-16'],
    ['w-6', 'w-20', 'w-20', 'w-28', 'w-16', 'w-20', 'w-14', 'w-14', 'w-16', 'w-16', 'w-16', 'w-20'],
    ['w-8', 'w-24', 'w-18', 'w-24', 'w-20', 'w-18', 'w-16', 'w-12', 'w-14', 'w-20', 'w-12', 'w-16'],
    ['w-6', 'w-28', 'w-20', 'w-32', 'w-14', 'w-16', 'w-18', 'w-16', 'w-16', 'w-14', 'w-16', 'w-18'],
];

const TableSkeleton = ({ cols = 6, rows = 8 }) => (
    <>
        {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="animate-pulse border-b border-slate-100">
                {Array.from({ length: cols }).map((_, colIdx) => {
                    const w = WIDTHS[rowIdx % WIDTHS.length][colIdx % 12] || 'w-20';
                    return (
                        <td key={colIdx} className="px-4 py-3">
                            <div className={`h-3 bg-slate-200 rounded ${w}`} />
                        </td>
                    );
                })}
            </tr>
        ))}
    </>
);

export default TableSkeleton;
