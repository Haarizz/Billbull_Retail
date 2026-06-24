import {
  Package, Dumbbell, Shirt, Droplets, Headphones, Cookie, Coffee, Tag, LayoutGrid,
} from 'lucide-react';

export const POS_PRODUCT_PAGE_SIZE = 40;

export const WALK_IN_CUSTOMER = {
  id: 'walk-in',
  code: '',
  name: 'Walk-in Customer',
  phone: '',
  balance: 0,
  membershipId: '',
  tier: '',
  loyaltyPoints: 0,
};

export const CATEGORY_ICONS = [
  Package, Dumbbell, Shirt, Droplets, Headphones, Cookie, Coffee, Tag, LayoutGrid,
];

export const STATUS_LABEL_TO_ENUM = {
  'Active': 'ACTIVE',
  'Partially Paid': 'PARTIALLY_PAID',
  'Ready to Convert': 'READY_TO_CONVERT',
  'Converted to Sale': 'CONVERTED',
  'Cancelled': 'CANCELLED',
  'Expired': 'EXPIRED',
};

export const STATUS_ENUM_TO_LABEL = {
  ACTIVE: 'Active',
  PARTIALLY_PAID: 'Partially Paid',
  READY_TO_CONVERT: 'Ready to Convert',
  CONVERTED: 'Converted to Sale',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};
