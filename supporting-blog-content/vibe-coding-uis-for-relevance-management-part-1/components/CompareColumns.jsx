'use client';

export default function CompareColumns({
  oldPanel,
  newPanel,
}) {
  return (
    <div className="compare-shell">
      <div className="compare-columns" role="region" aria-label="Query comparison results">
        <div className="compare-column compare-column--old">{oldPanel}</div>
        <div className="compare-column compare-column--new">{newPanel}</div>
      </div>
    </div>
  );
}
