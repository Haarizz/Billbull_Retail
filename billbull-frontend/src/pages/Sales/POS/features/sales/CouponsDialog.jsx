// Extracted verbatim from POSSales.jsx:9121-9191 (the Coupons Dialog region).
// Behaviour is unchanged; only the location moved. Every coupon state value
// (showCouponsDialog, couponCode, appliedCoupon, couponDiscount) stays in POSSales — appliedCoupon
// and couponDiscount are also read by the sibling Promotions Dialog, and setShowCouponsDialog is
// handed to POSTouchScreen through touchScreenProps. Every value below is passed down under its
// ORIGINAL POSSales name.
//
// This component owns no state, no effects, no refs, and calls no hooks. The Radix Dialog is
// ALWAYS MOUNTED (open={showCouponsDialog}), exactly as it was inline; the parent call site is
// unconditional. The IIFE below is a render-body expression, not a mount boundary.

import React from 'react';
import { CheckCircle, Tag } from 'lucide-react';

import { Button } from '../../../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../../components/ui/dialog';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';

function CouponsDialog({
  showCouponsDialog,
  setShowCouponsDialog,
  couponCode,
  setCouponCode,
  appliedCoupon,
  setAppliedCoupon,
  couponDiscount,
  setCouponDiscount,
  currentInvoice,
  setCurrentInvoice,
  recalculateInvoice,
  formatCurrency,
  showFeedback,
}) {
  return (
    <Dialog open={showCouponsDialog} onOpenChange={v => { if (!v) { setShowCouponsDialog(false); setCouponCode(''); } }}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-pink-500" /> Apply Coupon</DialogTitle>
          <DialogDescription>Enter a coupon code to apply a discount to the current sale.</DialogDescription>
        </DialogHeader>
        {(() => {
          const COUPON_RULES = [
            { code: 'SAVE10', label: 'SAVE10 — 10% off', type: 'percent', value: 10 },
            { code: 'WELCOME20', label: 'WELCOME20 — 20% off first purchase', type: 'percent', value: 20 },
            { code: 'MEMBER15', label: 'MEMBER15 — 15% for members', type: 'percent', value: 15 },
          ];
          const matched = COUPON_RULES.find(r => r.code === couponCode);
          const applyAndClose = () => {
            if (!matched) return;
            const subtotal = currentInvoice.subtotal || 0;
            const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
            setAppliedCoupon(matched.code);
            setCouponDiscount(discountAmt);
            setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
            setShowCouponsDialog(false);
            showFeedback('success', `Coupon ${matched.code} applied — ${matched.type === 'percent' ? matched.value + '%' : 'AED ' + matched.value} off`);
          };
          return (
            <div className="space-y-3 py-2">
              <Label>Coupon Code</Label>
              <Input placeholder="e.g. SAVE10, WELCOME20..." value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') applyAndClose(); }} />
              {appliedCoupon && (
                <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Coupon "{appliedCoupon}" applied — {formatCurrency(couponDiscount)} off</span>
                  <button type="button" className="text-red-400 hover:text-red-600 text-[10px] font-bold" onClick={() => {
                    setAppliedCoupon(null); setCouponDiscount(0);
                    setCurrentInvoice(prev => recalculateInvoice(prev.items, 0));
                    setCouponCode('');
                  }}>Remove</button>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-semibold">Available Coupons</p>
                {COUPON_RULES.map(c => (
                  <button key={c.code} type="button" onClick={() => setCouponCode(c.code)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${couponCode === c.code ? 'bg-pink-100 border-pink-300 text-pink-800' : 'bg-pink-50 hover:bg-pink-100 border-pink-100 text-pink-700'}`}>{c.label}</button>
                ))}
              </div>
            </div>
          );
        })()}
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCouponsDialog(false)}>Cancel</Button>
          <Button className="bg-pink-500 hover:bg-pink-600 text-white" disabled={!couponCode} onClick={() => {
            const COUPON_RULES = [
              { code: 'SAVE10', type: 'percent', value: 10 },
              { code: 'WELCOME20', type: 'percent', value: 20 },
              { code: 'MEMBER15', type: 'percent', value: 15 },
            ];
            const matched = COUPON_RULES.find(r => r.code === couponCode);
            if (!matched) { showFeedback('error', `Unknown coupon code: ${couponCode}`); return; }
            const subtotal = currentInvoice.subtotal || 0;
            const discountAmt = matched.type === 'percent' ? subtotal * matched.value / 100 : matched.value;
            setAppliedCoupon(matched.code); setCouponDiscount(discountAmt);
            setCurrentInvoice(prev => recalculateInvoice(prev.items, discountAmt));
            setShowCouponsDialog(false);
            showFeedback('success', `Coupon ${matched.code} applied — ${matched.value}% off`);
          }}>
            Apply Coupon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CouponsDialog;
