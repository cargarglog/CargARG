import React from 'react';

const Spinner: React.FC<{ size?: number; colorClass?: string }> = ({ size = 32, colorClass = 'border-blue-400' }) => (
  <div
    role="status"
    aria-label="loading"
    className={`inline-block animate-spin rounded-full border-4 border-t-transparent ${colorClass}`}
    style={{ width: size, height: size }}
  />
);

export default Spinner;

