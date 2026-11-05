import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PricingWorkspace from './PriceLevels/PricingWorkspace';

// Sales → Price Levels: the pricing workspace. ?tab=customers opens the Customer Price-List tab
// (the old /sales/customer-prices link redirects there).
export default function PriceLevels() {
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'customers' ? 'customers' : 'levels';
  return <PricingWorkspace key={tab} initialTab={tab} />;
}
