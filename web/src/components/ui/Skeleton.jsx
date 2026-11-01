import React from 'react';
import './Skeleton.css';

/** Grey placeholder block with a soft sheen. Width/height take any CSS length. */
export function Skeleton({ w = '100%', h = 14, r, className = '', style }) {
  return (
    <span
      aria-hidden="true"
      className={`ui-skeleton ${className}`}
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

/** Placeholder in the shape of a product card, for grids and rails while products load. */
export function SkeletonCard({ variant = 'default' }) {
  return (
    <div className={`ui-skeleton-card ui-skeleton-card--${variant}`} aria-hidden="true">
      <Skeleton className="ui-skeleton-well" h="auto" />
      <span className="ui-skeleton-lines">
        <Skeleton w="38%" h={10} />
        <Skeleton w="92%" h={16} />
        <Skeleton w="64%" h={16} />
        <Skeleton w="44%" h={18} />
      </span>
    </div>
  );
}

export default Skeleton;
