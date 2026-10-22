import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ChevronDown, MapPin, Plus, Search, Star, Truck, X } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NewDeliveryOrder from '../features/delivery/NewDeliveryOrder';
import DeliveryPersonSelect from '../features/delivery/DeliveryPersonSelect';
import { WALK_IN_CUSTOMER } from '../posConstants';

/**
 * CHARACTERIZATION — the POSSales.jsx "New Delivery Order" capture modal and its nested
 * "Add Shipping Address" modal, now rendered by POS/features/delivery/NewDeliveryOrder.jsx.
 *
 * The extraction is a Type-B feature-container move: presentation only. useDelivery() is still
 * called in POSSales, handleOutForDelivery is still owned by POSSales (it couples delivery to the
 * print/post path), and openQuickCustomerModal / customerOptions / currentInvoice /
 * formatCurrency are still the four shared orchestrator values the region always read. The child
 * declares no state, no effects, no refs and calls no hooks or APIs.
 *
 * Delivery Settlement is the HIGH-coupling other half of the delivery surface and deliberately
 * stays inline in POSSales — the source section below pins that.
 *
 * Structure — every behavioural test runs against BOTH variants:
 *   `OriginalRegion` — the pre-extraction POSSales JSX, kept VERBATIM as the behavioural
 *   reference. Every render-time closure it read is lifted to a prop under its ORIGINAL name.
 *   `ExtractedRegion` — the real NewDeliveryOrder, rendered with the same props.
 *
 * Known current behaviours pinned as-is (do NOT fix here):
 *   - The customer result list is capped at 5 and WALK_IN_CUSTOMER is filtered out of it.
 *   - Picking a customer only backfills the address when the textarea is still blank/whitespace.
 *   - "Out for Delivery" disables ONLY on deliveryOutLoading or an empty cart — the required
 *     fields are validated inside handleOutForDelivery, not by the button.
 *   - The saved-address picker renders even when the customer has no saved addresses (it shows
 *     "No saved addresses for this customer" and an "Add New Address" footer).
 *   - The add-address modal is guarded by `showDeliveryModal && deliveryShowAddAddressModal`,
 *     so the outer guard is passed into the child rather than assumed.
 *   - The add-address backdrop closes on click-away only while not saving; its own Cancel button
 *     resets deliveryNewAddress to the UAE default, but the backdrop/X close does NOT.
 */

// ── the verbatim block ──────────────────────────────────────────────────────────────────
function OriginalRegion({
  customerOptions,
  currentInvoice,
  formatCurrency,
  openQuickCustomerModal,
  handleOutForDelivery,
  showDeliveryModal,
  setShowDeliveryModal,
  deliveryCustomerId,
  setDeliveryCustomerId,
  deliveryCustomerSearch,
  setDeliveryCustomerSearch,
  deliveryAddress,
  setDeliveryAddress,
  deliveryShowAddressPicker,
  setDeliveryShowAddressPicker,
  deliveryDate,
  setDeliveryDate,
  deliveryTimeSlot,
  setDeliveryTimeSlot,
  deliveryInstructions,
  setDeliveryInstructions,
  deliveryCharge,
  setDeliveryCharge,
  deliveryNotes,
  setDeliveryNotes,
  deliveryPersons,
  deliveryPersonsLoading,
  deliveryDriver,
  setDeliveryDriver,
  deliveryValidationErrors,
  setDeliveryValidationErrors,
  deliveryOutLoading,
  deliveryShowAddAddressModal,
  setDeliveryShowAddAddressModal,
  deliveryNewAddress,
  setDeliveryNewAddress,
  deliveryAddressSaving,
  deliveryAddressError,
  setDeliveryAddressError,
  handleSaveDeliveryNewAddress,
}) {
  return (
    <>
      {/* REGION-VERBATIM-START */}
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="bg-[#F5C742] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-[#1E293B]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1E293B]/70">NEW DELIVERY ORDER</p>
                  <p className="text-sm font-black text-[#1E293B]">{currentInvoice.items.length} items • {formatCurrency(currentInvoice.total)}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setShowDeliveryModal(false); setDeliveryCustomerSearch(''); setDeliveryShowAddressPicker(false); setDeliveryShowAddAddressModal(false); }} className="text-[#1E293B]/60 hover:text-[#1E293B]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Unified Smart Customer Search */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Customer / Recipient <span className="text-red-500">*</span></label>
                {deliveryCustomerId ? (() => {
                  const c = customerOptions.find(x => String(x.id) === String(deliveryCustomerId));
                  if (!c) return null;
                  return (
                    <div className="border border-[#327F74]/30 rounded-xl px-4 py-3 bg-[#f0faf8] flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.phone || c.mobile || ''} {c.email ? `· ${c.email}` : ''}
                          {c.tier ? <span className="ml-2 text-[#327F74] font-medium">· {c.tier}</span> : null}
                        </p>
                      </div>
                      <button type="button" onClick={() => { setDeliveryCustomerId(''); setDeliveryCustomerSearch(''); setDeliveryShowAddressPicker(false); }}
                        className="text-xs text-[#327F74] hover:underline font-bold px-2 py-1 bg-white rounded-lg border border-[#327F74]/20 shadow-sm">
                        Change
                      </button>
                    </div>
                  );
                })() : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search by Name, Mobile, Email, TRN..." value={deliveryCustomerSearch}
                        onChange={e => setDeliveryCustomerSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#327F74]" />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl bg-white shadow-inner divide-y divide-gray-100">
                      {customerOptions
                        .filter(c => c.id !== WALK_IN_CUSTOMER.id)
                        .filter(c => {
                          const q = (deliveryCustomerSearch || '').toLowerCase();
                          if (!q) return true;
                          return (c.name || '').toLowerCase().includes(q) ||
                            (c.phone || '').toLowerCase().includes(q) ||
                            (c.mobile || '').toLowerCase().includes(q) ||
                            (c.email || '').toLowerCase().includes(q) ||
                            (c.trn || '').toLowerCase().includes(q);
                        })
                        .slice(0, 5)
                        .map(c => (
                          <button key={c.id} type="button"
                            onClick={() => {
                              setDeliveryCustomerId(String(c.id));
                              setDeliveryValidationErrors(prev => ({ ...prev, customer: '' }));
                              if (c.address || c.defaultShippingAddress) setDeliveryAddress(prev => prev?.trim() ? prev : (c.address || c.defaultShippingAddress));
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors">
                            <div className="w-8 h-8 rounded-full bg-[#327F74]/10 text-[#327F74] flex items-center justify-center font-bold text-xs">
                              {c.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                              <p className="text-xs text-gray-500 truncate">{c.phone || c.mobile || ''} {c.email ? `· ${c.email}` : ''}</p>
                            </div>
                          </button>
                        ))}
                      <div className="p-2 bg-slate-50">
                        <button type="button" onClick={() => openQuickCustomerModal(deliveryCustomerSearch)}
                          className="w-full py-2.5 px-3 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Create New Customer: "{deliveryCustomerSearch || 'Enter details'}"
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {deliveryValidationErrors.customer && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.customer}</p>}

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Address <span className="text-red-500">*</span></label>

                {/* Saved shipping-address picker — only once a real customer is selected */}
                {deliveryCustomerId && (() => {
                  const c = customerOptions.find(x => String(x.id) === String(deliveryCustomerId));
                  const savedAddresses = c?.savedAddresses || [];
                  return (
                    <div className="relative mb-2">
                      <button type="button"
                        onClick={() => setDeliveryShowAddressPicker(p => !p)}
                        className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left hover:border-[#327F74] transition-colors bg-white">
                        <MapPin className="h-4 w-4 text-[#327F74] shrink-0" />
                        <span className="flex-1 text-gray-600 truncate">
                          {savedAddresses.length > 0 ? 'Choose a saved shipping address…' : 'No saved addresses for this customer'}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      </button>
                      {deliveryShowAddressPicker && (
                        <div className="absolute z-10 top-full left-0 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden max-h-56 overflow-y-auto">
                          {savedAddresses.map((addr, i) => (
                            <button key={addr.id ?? i} type="button"
                              onClick={() => {
                                setDeliveryAddress([addr.address1, addr.address2, addr.city, addr.country].filter(Boolean).join(', '));
                                setDeliveryValidationErrors(prev => ({ ...prev, address: '' }));
                                setDeliveryShowAddressPicker(false);
                              }}
                              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 transition-colors">
                              <MapPin className="h-3.5 w-3.5 text-[#327F74] mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 truncate">
                                  {addr.name}
                                  {addr.isDefault && <Star className="h-2.5 w-2.5 text-[#F5C742] fill-[#F5C742] shrink-0" />}
                                </p>
                                <p className="text-xs text-gray-500 truncate">{[addr.address1, addr.city, addr.country].filter(Boolean).join(', ')}</p>
                              </div>
                            </button>
                          ))}
                          <button type="button"
                            onClick={() => { setDeliveryShowAddressPicker(false); setDeliveryAddressError(''); setDeliveryShowAddAddressModal(true); }}
                            className="w-full px-3 py-2.5 text-xs flex items-center justify-center gap-1.5 text-[#327F74] hover:bg-[#f0faf8] border-t border-dashed border-gray-200 font-bold">
                            <Plus className="h-3.5 w-3.5" /> Add New Address
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <textarea rows={3} value={deliveryAddress} onChange={e => { setDeliveryAddress(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, address: '' })); }}
                  placeholder="Building, street, area, city..."
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none ${deliveryValidationErrors.address ? 'border-red-300' : 'border-gray-200'}`} />
                {deliveryValidationErrors.address && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.address}</p>}
              </div>

              {/* Delivery Schedule (Date & Time Slot) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Date <span className="text-red-500">*</span></label>
                  <input type="date" value={deliveryDate} onChange={e => { setDeliveryDate(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, date: '' })); }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] bg-white ${deliveryValidationErrors.date ? 'border-red-300' : 'border-gray-200'}`} />
                  {deliveryValidationErrors.date && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.date}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Time Slot <span className="text-red-500">*</span></label>
                  <select value={deliveryTimeSlot} onChange={e => { setDeliveryTimeSlot(e.target.value); setDeliveryValidationErrors(prev => ({ ...prev, timeSlot: '' })); }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] bg-white ${deliveryValidationErrors.timeSlot ? 'border-red-300' : 'border-gray-200'}`}>
                    <option value="">— Select slot —</option>
                    <option value="Morning (9 AM - 1 PM)">Morning (9 AM - 1 PM)</option>
                    <option value="Afternoon (1 PM - 5 PM)">Afternoon (1 PM - 5 PM)</option>
                    <option value="Evening (5 PM - 9 PM)">Evening (5 PM - 9 PM)</option>
                  </select>
                  {deliveryValidationErrors.timeSlot && <p className="text-[11px] text-red-500 mt-1">{deliveryValidationErrors.timeSlot}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Special Delivery Instructions</label>
                <input type="text" value={deliveryInstructions} onChange={e => setDeliveryInstructions(e.target.value)}
                  placeholder="e.g. Call before arriving, leave at door..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Delivery Charge (AED)</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#327F74]">
                    <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-200 shrink-0">AED</span>
                    <input type="number" min="0" step="0.01" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">Optional — leave blank if free delivery</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Assign Delivery Person <span className="text-red-500">*</span></label>
                  <DeliveryPersonSelect
                    options={deliveryPersons}
                    value={deliveryDriver}
                    loading={deliveryPersonsLoading}
                    error={deliveryValidationErrors.deliveryDriver}
                    onChange={(employeeCode) => {
                      setDeliveryDriver(employeeCode);
                      setDeliveryValidationErrors(prev => ({ ...prev, deliveryDriver: '' }));
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Order Notes / Delivery Remarks</label>
                <textarea rows={2} value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="Special instructions, landmarks, contact note..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#327F74] resize-none" />
              </div>
            </div>

            {parseFloat(deliveryCharge) > 0 && (
              <div className="px-5 py-3 bg-[#FFF8E7] border-t border-[#FDE6A9] flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Order: <span className="font-semibold text-gray-800">{formatCurrency(currentInvoice.total)}</span>
                  {' '}+{' '}Delivery: <span className="font-semibold text-gray-800">{formatCurrency(parseFloat(deliveryCharge) || 0)}</span>
                </span>
                <span className="font-bold text-[#1E293B]">= {formatCurrency(currentInvoice.total + (parseFloat(deliveryCharge) || 0))}</span>
              </div>
            )}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => { setShowDeliveryModal(false); setDeliveryShowAddressPicker(false); setDeliveryShowAddAddressModal(false); }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={deliveryOutLoading || currentInvoice.items.length === 0}
                onClick={handleOutForDelivery}
                className="flex-1 py-3 rounded-xl bg-[#327F74] hover:bg-[#2a6b61] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <Truck className="h-4 w-4" />
                {deliveryOutLoading ? 'Saving…' : 'Out for Delivery'}
              </button>
            </div>
          </div>
        </div>

      {/* ══ Add New Shipping Address modal (nested within New Delivery Order) ══ */}
      {showDeliveryModal && deliveryShowAddAddressModal && (
        <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !deliveryAddressSaving && setDeliveryShowAddAddressModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">Add Shipping Address</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add a new shipping address for {customerOptions.find(x => String(x.id) === String(deliveryCustomerId))?.name || 'this customer'}
                </p>
              </div>
              <button type="button"
                onClick={() => !deliveryAddressSaving && setDeliveryShowAddAddressModal(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Address Label <span className="text-red-500">*</span></label>
                <input type="text" value={deliveryNewAddress.name}
                  onChange={e => setDeliveryNewAddress(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Home, Office, Warehouse..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Address <span className="text-red-500">*</span></label>
                <textarea rows={3} value={deliveryNewAddress.address1}
                  onChange={e => setDeliveryNewAddress(p => ({ ...p, address1: e.target.value }))}
                  placeholder="Building, street, area..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#327F74]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">City</label>
                  <input type="text" value={deliveryNewAddress.city}
                    onChange={e => setDeliveryNewAddress(p => ({ ...p, city: e.target.value }))}
                    placeholder="e.g., Dubai"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Country</label>
                  <input type="text" value={deliveryNewAddress.country}
                    onChange={e => setDeliveryNewAddress(p => ({ ...p, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Contact Person</label>
                  <input type="text" value={deliveryNewAddress.contactName}
                    onChange={e => setDeliveryNewAddress(p => ({ ...p, contactName: e.target.value }))}
                    placeholder="Contact name"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Contact Phone</label>
                  <input type="text" value={deliveryNewAddress.contactPhone}
                    onChange={e => setDeliveryNewAddress(p => ({ ...p, contactPhone: e.target.value }))}
                    placeholder="+971 XX XXX XXXX"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#327F74]" />
                </div>
              </div>
              {deliveryAddressError && <p className="text-[11px] text-red-500">{deliveryAddressError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button"
                onClick={() => {
                  setDeliveryNewAddress({ name: '', address1: '', city: '', country: 'UAE', contactName: '', contactPhone: '' });
                  setDeliveryAddressError('');
                  setDeliveryShowAddAddressModal(false);
                }}
                disabled={deliveryAddressSaving}
                className="px-4 py-2 text-xs font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="button"
                onClick={handleSaveDeliveryNewAddress}
                disabled={deliveryAddressSaving}
                className="px-4 py-2 text-xs font-bold text-white bg-[#327F74] hover:bg-[#2a6b61] rounded-xl disabled:opacity-60 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> {deliveryAddressSaving ? 'Saving…' : 'Add Address'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* REGION-VERBATIM-END */}
    </>
  );
}

// ── harness ─────────────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  WALK_IN_CUSTOMER,
  {
    id: 'c1', name: 'Aisha Khan', phone: '0501111111', email: 'aisha@example.com', trn: '100200300',
    tier: 'Gold', address: 'Villa 4, Jumeirah',
    savedAddresses: [
      { id: 'a1', name: 'Home', address1: 'Villa 4', address2: 'Street 2', city: 'Dubai', country: 'UAE', isDefault: true },
      { id: 'a2', name: 'Office', address1: 'Tower 1', city: 'Abu Dhabi', country: 'UAE' },
    ],
  },
  { id: 'c2', name: 'Bilal Noor', mobile: '0502222222', savedAddresses: [] },
  { id: 'c3', name: 'Carla Diaz', phone: '0503333333', email: 'carla@example.com' },
  { id: 'c4', name: 'Dan Ali', phone: '0504444444' },
  { id: 'c5', name: 'Eva Roy', phone: '0505555555' },
  { id: 'c6', name: 'Faiz Omar', phone: '0506666666' },
];

const PERSONS = [
  { employeeCode: 'EMP-1', name: 'Rider One', phone: '0509999999' },
  { employeeCode: 'EMP-2', name: 'Rider Two', phone: '0508888888' },
];

const BLANK_ADDRESS = { name: '', address1: '', city: '', country: 'UAE', contactName: '', contactPhone: '' };

const formatCurrency = (n) => `AED ${Number(n || 0).toFixed(2)}`;

function baseProps(overrides = {}) {
  return {
    customerOptions: CUSTOMERS,
    currentInvoice: { items: [{ id: 1 }, { id: 2 }], total: 250 },
    formatCurrency,
    openQuickCustomerModal: vi.fn(),
    handleOutForDelivery: vi.fn(),
    showDeliveryModal: true,
    setShowDeliveryModal: vi.fn(),
    deliveryCustomerId: '',
    setDeliveryCustomerId: vi.fn(),
    deliveryCustomerSearch: '',
    setDeliveryCustomerSearch: vi.fn(),
    deliveryAddress: '',
    setDeliveryAddress: vi.fn(),
    deliveryShowAddressPicker: false,
    setDeliveryShowAddressPicker: vi.fn(),
    deliveryDate: '',
    setDeliveryDate: vi.fn(),
    deliveryTimeSlot: '',
    setDeliveryTimeSlot: vi.fn(),
    deliveryInstructions: '',
    setDeliveryInstructions: vi.fn(),
    deliveryCharge: '',
    setDeliveryCharge: vi.fn(),
    deliveryNotes: '',
    setDeliveryNotes: vi.fn(),
    deliveryPersons: PERSONS,
    deliveryPersonsLoading: false,
    deliveryDriver: '',
    setDeliveryDriver: vi.fn(),
    deliveryValidationErrors: {},
    setDeliveryValidationErrors: vi.fn(),
    deliveryOutLoading: false,
    deliveryShowAddAddressModal: false,
    setDeliveryShowAddAddressModal: vi.fn(),
    deliveryNewAddress: BLANK_ADDRESS,
    setDeliveryNewAddress: vi.fn(),
    deliveryAddressSaving: false,
    deliveryAddressError: '',
    setDeliveryAddressError: vi.fn(),
    handleSaveDeliveryNewAddress: vi.fn(),
    ...overrides,
  };
}

const VARIANTS = [
  ['OriginalRegion', OriginalRegion],
  ['NewDeliveryOrder', NewDeliveryOrder],
];

/** Render one variant; returns { props, container }. */
const mount = (Variant, overrides = {}) => {
  const props = baseProps(overrides);
  const { container } = render(<Variant {...props} />);
  return { props, container };
};

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — initial / open state', (_name, Variant) => {
  it('renders the header with the item count and the formatted invoice total', () => {
    mount(Variant);
    expect(screen.getByText('NEW DELIVERY ORDER')).toBeTruthy();
    expect(screen.getByText('2 items • AED 250.00')).toBeTruthy();
  });

  it('opens on the customer search step with no selected-customer card', () => {
    mount(Variant);
    expect(screen.getByPlaceholderText('Search by Name, Mobile, Email, TRN...')).toBeTruthy();
    expect(screen.queryByText('Change')).toBeNull();
  });

  it('renders every required-field label and the optional ones', () => {
    mount(Variant);
    for (const label of ['Customer / Recipient', 'Delivery Address', 'Delivery Date', 'Time Slot',
      'Assign Delivery Person']) {
      expect(screen.getByText(label).textContent, label).toContain('*');
    }
    expect(screen.getByText('Special Delivery Instructions')).toBeTruthy();
    expect(screen.getByText('Delivery Charge (AED)')).toBeTruthy();
    expect(screen.getByText('Order Notes / Delivery Remarks')).toBeTruthy();
    expect(screen.getByText('Optional — leave blank if free delivery')).toBeTruthy();
  });

  it('offers exactly the three fixed time slots behind a blank placeholder', () => {
    const { container } = mount(Variant);
    const select = container.querySelector('select');
    expect([...select.options].map(o => o.value)).toEqual([
      '', 'Morning (9 AM - 1 PM)', 'Afternoon (1 PM - 5 PM)', 'Evening (5 PM - 9 PM)',
    ]);
  });

  it('hides the address picker and the add-address modal until they are asked for', () => {
    mount(Variant);
    expect(screen.queryByText('Choose a saved shipping address…')).toBeNull();
    expect(screen.queryByText('Add Shipping Address')).toBeNull();
  });

  it('hides the charge summary strip while the delivery charge is blank or zero', () => {
    mount(Variant);
    expect(screen.queryByText(/^= /)).toBeNull();
    cleanup();
    render(<Variant {...baseProps({ deliveryCharge: '0' })} />);
    expect(screen.queryByText(/^= /)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — customer selection', (_name, Variant) => {
  const resultRows = (container) => {
    const list = container.querySelector('.divide-y');
    return [...list.querySelectorAll('button')].filter(b => !b.textContent.includes('Create New Customer'));
  };

  it('lists at most five customers and never the walk-in row', () => {
    const { container } = mount(Variant);
    expect(resultRows(container)).toHaveLength(5);
    expect(container.querySelector('.divide-y').textContent).not.toContain(WALK_IN_CUSTOMER.name);
  });

  it('filters the list on name, phone, mobile, email and TRN', () => {
    for (const [query, expected] of [['aisha', 'Aisha Khan'], ['0502222222', 'Bilal Noor'],
      ['carla@example.com', 'Carla Diaz'], ['100200300', 'Aisha Khan']]) {
      cleanup();
      const { container } = render(<Variant {...baseProps({ deliveryCustomerSearch: query })} />);
      const rows = resultRows(container);
      expect(rows, query).toHaveLength(1);
      expect(rows[0].textContent, query).toContain(expected);
    }
  });

  it('typing in the search box writes straight back through setDeliveryCustomerSearch', () => {
    const { props } = mount(Variant);
    fireEvent.change(screen.getByPlaceholderText('Search by Name, Mobile, Email, TRN...'), { target: { value: 'bil' } });
    expect(props.setDeliveryCustomerSearch).toHaveBeenCalledWith('bil');
  });

  it('picking a customer sets the id, clears the customer error and backfills a blank address', () => {
    const { props } = mount(Variant);
    fireEvent.click(screen.getByText('Aisha Khan'));
    expect(props.setDeliveryCustomerId).toHaveBeenCalledWith('c1');
    const errUpdater = props.setDeliveryValidationErrors.mock.calls[0][0];
    expect(errUpdater({ customer: 'Required', address: 'Required' })).toEqual({ customer: '', address: 'Required' });
    const addrUpdater = props.setDeliveryAddress.mock.calls[0][0];
    expect(addrUpdater('')).toBe('Villa 4, Jumeirah');
    expect(addrUpdater('   ')).toBe('Villa 4, Jumeirah');
    expect(addrUpdater('Existing address')).toBe('Existing address');
  });

  it('does not touch the address when the picked customer has none on file', () => {
    const { props } = mount(Variant);
    fireEvent.click(screen.getByText('Bilal Noor'));
    expect(props.setDeliveryCustomerId).toHaveBeenCalledWith('c2');
    expect(props.setDeliveryAddress).not.toHaveBeenCalled();
  });

  it('shows the selected customer card with contact line and tier once a customer is chosen', () => {
    mount(Variant, { deliveryCustomerId: 'c1' });
    expect(screen.getByText('Aisha Khan')).toBeTruthy();
    expect(screen.getByText(/aisha@example\.com/)).toBeTruthy();
    expect(screen.getByText('· Gold')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search by Name, Mobile, Email, TRN...')).toBeNull();
  });

  it('Change clears the id, the search text and the address picker', () => {
    const { props } = mount(Variant, { deliveryCustomerId: 'c1', deliveryCustomerSearch: 'ais' });
    fireEvent.click(screen.getByText('Change'));
    expect(props.setDeliveryCustomerId).toHaveBeenCalledWith('');
    expect(props.setDeliveryCustomerSearch).toHaveBeenCalledWith('');
    expect(props.setDeliveryShowAddressPicker).toHaveBeenCalledWith(false);
  });

  it('renders nothing for the customer block when the selected id is not in customerOptions', () => {
    mount(Variant, { deliveryCustomerId: 'ghost' });
    expect(screen.queryByText('Change')).toBeNull();
    expect(screen.queryByPlaceholderText('Search by Name, Mobile, Email, TRN...')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — empty customer list', (_name, Variant) => {
  it('still renders the search box and the Create New Customer footer with no rows', () => {
    const { container } = mount(Variant, { customerOptions: [] });
    const list = container.querySelector('.divide-y');
    const rows = [...list.querySelectorAll('button')].filter(b => !b.textContent.includes('Create New Customer'));
    expect(rows).toHaveLength(0);
    expect(screen.getByText(/Create New Customer/)).toBeTruthy();
  });

  it('falls back to "Enter details" in the create-customer label while the search is blank', () => {
    mount(Variant, { customerOptions: [] });
    expect(screen.getByText(/Create New Customer: "Enter details"/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — quick-customer invocation', (_name, Variant) => {
  it('passes the current search text to openQuickCustomerModal', () => {
    const { props } = mount(Variant, { deliveryCustomerSearch: 'Zara' });
    expect(screen.getByText(/Create New Customer: "Zara"/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Create New Customer/).closest('button'));
    expect(props.openQuickCustomerModal).toHaveBeenCalledWith('Zara');
  });

  it('passes the empty string when nothing has been typed', () => {
    const { props } = mount(Variant);
    fireEvent.click(screen.getByText(/Create New Customer/).closest('button'));
    expect(props.openQuickCustomerModal).toHaveBeenCalledWith('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — address capture', (_name, Variant) => {
  it('shows no saved-address picker until a customer is selected', () => {
    mount(Variant);
    expect(screen.queryByText('Choose a saved shipping address…')).toBeNull();
    expect(screen.queryByText('No saved addresses for this customer')).toBeNull();
  });

  it('offers the picker for a customer WITH saved addresses', () => {
    mount(Variant, { deliveryCustomerId: 'c1' });
    expect(screen.getByText('Choose a saved shipping address…')).toBeTruthy();
  });

  it('still renders the picker for a customer WITHOUT saved addresses, with the empty label', () => {
    mount(Variant, { deliveryCustomerId: 'c2' });
    expect(screen.getByText('No saved addresses for this customer')).toBeTruthy();
  });

  it('treats a missing savedAddresses array as empty', () => {
    mount(Variant, { deliveryCustomerId: 'c3' });
    expect(screen.getByText('No saved addresses for this customer')).toBeTruthy();
  });

  it('toggles the picker through a functional setter', () => {
    const { props } = mount(Variant, { deliveryCustomerId: 'c1' });
    fireEvent.click(screen.getByText('Choose a saved shipping address…').closest('button'));
    const toggle = props.setDeliveryShowAddressPicker.mock.calls[0][0];
    expect(toggle(false)).toBe(true);
    expect(toggle(true)).toBe(false);
  });

  it('lists each saved address, flags the default one, and joins the summary line', () => {
    mount(Variant, { deliveryCustomerId: 'c1', deliveryShowAddressPicker: true });
    expect(screen.getByText('Office')).toBeTruthy();
    expect(screen.getByText('Villa 4, Dubai, UAE')).toBeTruthy();
    expect(screen.getByText('Tower 1, Abu Dhabi, UAE')).toBeTruthy();
  });

  it('choosing a saved address joins address1/2/city/country, clears the error and shuts the picker', () => {
    const { props, container } = mount(Variant, { deliveryCustomerId: 'c1', deliveryShowAddressPicker: true });
    const picker = container.querySelector('.absolute.z-10');
    fireEvent.click(picker.querySelectorAll('button')[0]);
    expect(props.setDeliveryAddress).toHaveBeenCalledWith('Villa 4, Street 2, Dubai, UAE');
    const updater = props.setDeliveryValidationErrors.mock.calls[0][0];
    expect(updater({ address: 'Required', date: 'Required' })).toEqual({ address: '', date: 'Required' });
    expect(props.setDeliveryShowAddressPicker).toHaveBeenCalledWith(false);
  });

  it('typing in the textarea writes the value through and clears the address error', () => {
    const { props, container } = mount(Variant);
    const textarea = container.querySelector('textarea[placeholder="Building, street, area, city..."]');
    fireEvent.change(textarea, { target: { value: 'Flat 9' } });
    expect(props.setDeliveryAddress).toHaveBeenCalledWith('Flat 9');
    const updater = props.setDeliveryValidationErrors.mock.calls[0][0];
    expect(updater({ address: 'Required' })).toEqual({ address: '' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — schedule, charge and notes', (_name, Variant) => {
  it('writes the date through and clears its error', () => {
    const { props, container } = mount(Variant);
    fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: '2026-09-20' } });
    expect(props.setDeliveryDate).toHaveBeenCalledWith('2026-09-20');
    expect(props.setDeliveryValidationErrors.mock.calls[0][0]({ date: 'Required' })).toEqual({ date: '' });
  });

  it('writes the time slot through and clears its error', () => {
    const { props, container } = mount(Variant);
    fireEvent.change(container.querySelector('select'), { target: { value: 'Evening (5 PM - 9 PM)' } });
    expect(props.setDeliveryTimeSlot).toHaveBeenCalledWith('Evening (5 PM - 9 PM)');
    expect(props.setDeliveryValidationErrors.mock.calls[0][0]({ timeSlot: 'x' })).toEqual({ timeSlot: '' });
  });

  it('writes instructions, charge and notes through WITHOUT touching the error map', () => {
    const { props, container } = mount(Variant);
    fireEvent.change(screen.getByPlaceholderText('e.g. Call before arriving, leave at door...'), { target: { value: 'Ring bell' } });
    fireEvent.change(container.querySelector('input[type="number"]'), { target: { value: '15' } });
    fireEvent.change(screen.getByPlaceholderText('Special instructions, landmarks, contact note...'), { target: { value: 'Blue gate' } });
    expect(props.setDeliveryInstructions).toHaveBeenCalledWith('Ring bell');
    expect(props.setDeliveryCharge).toHaveBeenCalledWith('15');
    expect(props.setDeliveryNotes).toHaveBeenCalledWith('Blue gate');
    expect(props.setDeliveryValidationErrors).not.toHaveBeenCalled();
  });

  it('shows the order + delivery = grand total strip once the charge parses above zero', () => {
    mount(Variant, { deliveryCharge: '15.5' });
    expect(screen.getByText(/Order:/).textContent).toContain('AED 250.00');
    expect(screen.getByText(/Order:/).textContent).toContain('AED 15.50');
    expect(screen.getByText('= AED 265.50')).toBeTruthy();
  });

  it('keeps the strip hidden for a non-numeric charge', () => {
    mount(Variant, { deliveryCharge: 'abc' });
    expect(screen.queryByText(/^= /)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — delivery person', (_name, Variant) => {
  it('renders the DeliveryPersonSelect combobox fed from deliveryPersons', () => {
    const { container } = mount(Variant);
    const combo = container.querySelector('[role="combobox"]');
    expect(combo).toBeTruthy();
    fireEvent.focus(combo);
    expect(screen.getByText('Rider One')).toBeTruthy();
    expect(screen.getByText('Rider Two')).toBeTruthy();
  });

  it('selecting a rider sets the driver by employeeCode and clears the driver error', () => {
    const { props, container } = mount(Variant);
    fireEvent.focus(container.querySelector('[role="combobox"]'));
    fireEvent.click(screen.getByText('Rider Two').closest('button'));
    expect(props.setDeliveryDriver).toHaveBeenCalledWith('EMP-2');
    const updater = props.setDeliveryValidationErrors.mock.calls[0][0];
    expect(updater({ deliveryDriver: 'Required' })).toEqual({ deliveryDriver: '' });
  });

  it('shows the already-selected rider as "name (code)"', () => {
    const { container } = mount(Variant, { deliveryDriver: 'EMP-1' });
    expect(container.querySelector('[role="combobox"]').value).toBe('Rider One (EMP-1)');
  });

  it('surfaces the loading placeholder while deliveryPersonsLoading is set', () => {
    const { container } = mount(Variant, { deliveryPersons: [], deliveryPersonsLoading: true });
    expect(container.querySelector('[role="combobox"]').placeholder).toBe('Loading delivery persons...');
  });

  it('shows the empty-roster message when there are no delivery persons', () => {
    const { container } = mount(Variant, { deliveryPersons: [] });
    fireEvent.focus(container.querySelector('[role="combobox"]'));
    expect(screen.getByText('No active delivery persons found')).toBeTruthy();
  });

  it('passes the driver validation error down to the select', () => {
    mount(Variant, { deliveryValidationErrors: { deliveryDriver: 'Assign a delivery person' } });
    expect(screen.getByText('Assign a delivery person')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — validation / error states', (_name, Variant) => {
  it('renders each field error under its own field', () => {
    mount(Variant, {
      deliveryValidationErrors: {
        customer: 'Select a customer', address: 'Address is required',
        date: 'Pick a date', timeSlot: 'Pick a slot',
      },
    });
    for (const msg of ['Select a customer', 'Address is required', 'Pick a date', 'Pick a slot']) {
      expect(screen.getByText(msg), msg).toBeTruthy();
    }
  });

  it('marks the address, date and slot controls red only while their error is set', () => {
    const { container } = mount(Variant);
    expect(container.querySelector('textarea[placeholder="Building, street, area, city..."]').className).toContain('border-gray-200');
    expect(container.querySelector('input[type="date"]').className).toContain('border-gray-200');
    expect(container.querySelector('select').className).toContain('border-gray-200');
    cleanup();
    const { container: bad } = render(<Variant {...baseProps({
      deliveryValidationErrors: { address: 'x', date: 'y', timeSlot: 'z' },
    })} />);
    expect(bad.querySelector('textarea[placeholder="Building, street, area, city..."]').className).toContain('border-red-300');
    expect(bad.querySelector('input[type="date"]').className).toContain('border-red-300');
    expect(bad.querySelector('select').className).toContain('border-red-300');
  });

  it('renders no error paragraphs at all for an empty error map', () => {
    const { container } = mount(Variant);
    expect(container.querySelectorAll('p.text-red-500')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — submission, loading and close', (_name, Variant) => {
  it('calls handleOutForDelivery — the parent-owned callback — exactly once', () => {
    const { props } = mount(Variant);
    fireEvent.click(screen.getByText('Out for Delivery').closest('button'));
    expect(props.handleOutForDelivery).toHaveBeenCalledTimes(1);
  });

  it('enables the submit button even when every required field is blank', () => {
    mount(Variant);
    expect(screen.getByText('Out for Delivery').closest('button').disabled).toBe(false);
  });

  it('disables submission while deliveryOutLoading and swaps the label to Saving…', () => {
    mount(Variant, { deliveryOutLoading: true });
    const btn = screen.getByText('Saving…').closest('button');
    expect(btn.disabled).toBe(true);
    expect(screen.queryByText('Out for Delivery')).toBeNull();
  });

  it('disables submission on an empty cart', () => {
    mount(Variant, { currentInvoice: { items: [], total: 0 } });
    expect(screen.getByText('Out for Delivery').closest('button').disabled).toBe(true);
    expect(screen.getByText('0 items • AED 0.00')).toBeTruthy();
  });

  it('the header X closes the modal and resets search, picker and add-address', () => {
    const { props, container } = mount(Variant);
    fireEvent.click(container.querySelector('.bg-\\[\\#F5C742\\] button'));
    expect(props.setShowDeliveryModal).toHaveBeenCalledWith(false);
    expect(props.setDeliveryCustomerSearch).toHaveBeenCalledWith('');
    expect(props.setDeliveryShowAddressPicker).toHaveBeenCalledWith(false);
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(false);
  });

  it('the footer Cancel closes the modal and the two sub-surfaces but does NOT clear the search', () => {
    const { props } = mount(Variant);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.setShowDeliveryModal).toHaveBeenCalledWith(false);
    expect(props.setDeliveryShowAddressPicker).toHaveBeenCalledWith(false);
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(false);
    expect(props.setDeliveryCustomerSearch).not.toHaveBeenCalled();
  });

  it('keeps Cancel before Out for Delivery in the footer', () => {
    const { container } = mount(Variant);
    const footer = container.querySelector('.border-t.border-gray-100.flex.gap-3');
    const labels = [...footer.querySelectorAll('button')].map(b => b.textContent.trim());
    expect(labels).toEqual(['Cancel', 'Out for Delivery']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — nested Add-Address modal', (_name, Variant) => {
  const open = (overrides = {}) => mount(Variant, {
    deliveryCustomerId: 'c1', deliveryShowAddAddressModal: true, ...overrides,
  });

  it('stays closed while deliveryShowAddAddressModal is false', () => {
    mount(Variant, { deliveryCustomerId: 'c1' });
    expect(screen.queryByText('Add Shipping Address')).toBeNull();
  });

  it('stays closed when the OUTER showDeliveryModal guard is false, even if its own flag is set', () => {
    render(<Variant {...baseProps({
      deliveryCustomerId: 'c1', deliveryShowAddAddressModal: true, showDeliveryModal: false,
    })} />);
    expect(screen.queryByText('Add Shipping Address')).toBeNull();
  });

  it('opens from the picker footer, clearing the address error and shutting the picker first', () => {
    const { props } = mount(Variant, { deliveryCustomerId: 'c1', deliveryShowAddressPicker: true });
    fireEvent.click(screen.getByText('Add New Address').closest('button'));
    expect(props.setDeliveryShowAddressPicker).toHaveBeenCalledWith(false);
    expect(props.setDeliveryAddressError).toHaveBeenCalledWith('');
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(true);
  });

  it('names the selected customer in the subtitle', () => {
    open();
    expect(screen.getByText('Add a new shipping address for Aisha Khan')).toBeTruthy();
  });

  it('falls back to "this customer" when the id resolves to nobody', () => {
    open({ deliveryCustomerId: 'ghost' });
    expect(screen.getByText('Add a new shipping address for this customer')).toBeTruthy();
  });

  it('renders the six address fields with Label and Address marked required', () => {
    const { container } = open();
    const dialog = container.querySelector('.z-\\[210\\]');
    const labels = [...dialog.querySelectorAll('label')].map(l => l.textContent.trim());
    expect(labels).toEqual(['Address Label *', 'Address *', 'City', 'Country', 'Contact Person', 'Contact Phone']);
  });

  // Each field's onChange is `setDeliveryNewAddress(p => ({ ...p, <key>: e.target.value }))`, and
  // the updater reads e.target.value LAZILY — so it has to be applied inside the event, while the
  // synthetic event is still live. This mock does exactly that.
  const applyingSetter = () => {
    const applied = [];
    const fn = vi.fn((updater) => {
      applied.push(typeof updater === 'function' ? updater(BLANK_ADDRESS) : updater);
    });
    return [fn, applied];
  };

  it('each field edits deliveryNewAddress through a functional merge of its own key', () => {
    const [setDeliveryNewAddress, applied] = applyingSetter();
    open({ setDeliveryNewAddress });
    const edits = [
      [screen.getByPlaceholderText('e.g., Home, Office, Warehouse...'), 'Home', 'name'],
      [screen.getByPlaceholderText('Building, street, area...'), 'Villa 4', 'address1'],
      [screen.getByPlaceholderText('e.g., Dubai'), 'Dubai', 'city'],
      [screen.getByPlaceholderText('Contact name'), 'Aisha', 'contactName'],
      [screen.getByPlaceholderText('+971 XX XXX XXXX'), '0501111111', 'contactPhone'],
    ];
    for (const [el, value] of edits) fireEvent.change(el, { target: { value } });
    expect(setDeliveryNewAddress).toHaveBeenCalledTimes(5);
    edits.forEach(([, value, key], i) => {
      expect(applied[i], key).toEqual({ ...BLANK_ADDRESS, [key]: value });
    });
  });

  it('prefills Country from deliveryNewAddress and edits it through the same merge', () => {
    const [setDeliveryNewAddress, applied] = applyingSetter();
    const { container } = open({
      deliveryNewAddress: { ...BLANK_ADDRESS, country: 'UAE' }, setDeliveryNewAddress,
    });
    const dialog = container.querySelector('.z-\\[210\\]');
    const country = [...dialog.querySelectorAll('input[type="text"]')].find(i => !i.placeholder);
    expect(country.value).toBe('UAE');
    fireEvent.change(country, { target: { value: 'KSA' } });
    expect(applied[0]).toEqual({ ...BLANK_ADDRESS, country: 'KSA' });
  });

  it('shows deliveryAddressError only when it is set', () => {
    open();
    expect(screen.queryByText('Label and address are required')).toBeNull();
    cleanup();
    render(<Variant {...baseProps({
      deliveryCustomerId: 'c1', deliveryShowAddAddressModal: true,
      deliveryAddressError: 'Label and address are required',
    })} />);
    expect(screen.getByText('Label and address are required')).toBeTruthy();
  });

  it('Add Address calls the parent-owned handleSaveDeliveryNewAddress', () => {
    const { props } = open();
    fireEvent.click(screen.getByText(/Add Address/).closest('button'));
    expect(props.handleSaveDeliveryNewAddress).toHaveBeenCalledTimes(1);
  });

  it('while saving, both buttons disable and the primary label becomes Saving…', () => {
    const { container } = open({ deliveryAddressSaving: true });
    const dialog = container.querySelector('.z-\\[210\\]');
    const [cancel, save] = [...dialog.querySelectorAll('button')].slice(-2);
    expect(cancel.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(save.textContent).toContain('Saving…');
  });

  it('its Cancel resets deliveryNewAddress to the UAE default, clears the error and closes', () => {
    const { props, container } = open();
    const dialog = container.querySelector('.z-\\[210\\]');
    const cancel = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel');
    fireEvent.click(cancel);
    expect(props.setDeliveryNewAddress).toHaveBeenCalledWith(BLANK_ADDRESS);
    expect(props.setDeliveryAddressError).toHaveBeenCalledWith('');
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(false);
  });

  it('its X closes WITHOUT resetting the draft address', () => {
    const { props, container } = open();
    const x = container.querySelector('.z-\\[210\\] .flex.items-start.justify-between button');
    fireEvent.click(x);
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(false);
    expect(props.setDeliveryNewAddress).not.toHaveBeenCalled();
  });

  it('the backdrop closes it; the card itself does not; and neither closes it while saving', () => {
    const { props, container } = open();
    fireEvent.click(container.querySelector('.z-\\[210\\]'));
    expect(props.setDeliveryShowAddAddressModal).toHaveBeenCalledWith(false);
    props.setDeliveryShowAddAddressModal.mockClear();
    fireEvent.click(container.querySelector('.z-\\[210\\] > div'));
    expect(props.setDeliveryShowAddAddressModal).not.toHaveBeenCalled();
    cleanup();
    const busy = mount(Variant, {
      deliveryCustomerId: 'c1', deliveryShowAddAddressModal: true, deliveryAddressSaving: true,
    });
    fireEvent.click(busy.container.querySelector('.z-\\[210\\]'));
    expect(busy.props.setDeliveryShowAddAddressModal).not.toHaveBeenCalled();
  });

  it('nests above the capture modal — z-[210] over z-[200] — with both mounted at once', () => {
    const { container } = open();
    expect(container.querySelector('.z-\\[200\\]')).toBeTruthy();
    expect(container.querySelector('.z-\\[210\\]')).toBeTruthy();
    expect(within(container.querySelector('.z-\\[200\\]')).queryByText('Add Shipping Address')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe.each(VARIANTS)('%s — null / empty tolerance', (_name, Variant) => {
  it('tolerates a fully blank capture state without throwing or rendering an error', () => {
    expect(() => mount(Variant, {
      deliveryValidationErrors: { customer: '', address: '', date: '', timeSlot: '', deliveryDriver: '' },
      deliveryAddress: '', deliveryNotes: '', deliveryInstructions: '', deliveryCharge: '',
      deliveryDate: '', deliveryTimeSlot: '', deliveryDriver: '',
    })).not.toThrow();
    expect(screen.queryAllByText(/Required/)).toHaveLength(0);
  });

  it('tolerates customers with no phone/mobile/email on the result rows', () => {
    mount(Variant, { customerOptions: [WALK_IN_CUSTOMER, { id: 'z', name: 'Zed' }] });
    expect(screen.getByText('Zed')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * SOURCE PINS — the extraction contract itself.
 */
describe('source contract', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');
  const CHILD = read('../features/delivery/NewDeliveryOrder.jsx');
  const PARENT = read('../../POSSales.jsx');
  const TEST = read('./NewDeliveryOrder.characterization.test.jsx');

  const EXPECTED_PROPS = [
    'customerOptions', 'currentInvoice', 'formatCurrency', 'openQuickCustomerModal',
    'handleOutForDelivery',
    'showDeliveryModal', 'setShowDeliveryModal',
    'deliveryCustomerId', 'setDeliveryCustomerId', 'deliveryCustomerSearch', 'setDeliveryCustomerSearch',
    'deliveryAddress', 'setDeliveryAddress', 'deliveryShowAddressPicker', 'setDeliveryShowAddressPicker',
    'deliveryDate', 'setDeliveryDate', 'deliveryTimeSlot', 'setDeliveryTimeSlot',
    'deliveryInstructions', 'setDeliveryInstructions', 'deliveryCharge', 'setDeliveryCharge',
    'deliveryNotes', 'setDeliveryNotes',
    'deliveryPersons', 'deliveryPersonsLoading', 'deliveryDriver', 'setDeliveryDriver',
    'deliveryValidationErrors', 'setDeliveryValidationErrors', 'deliveryOutLoading',
    'deliveryShowAddAddressModal', 'setDeliveryShowAddAddressModal',
    'deliveryNewAddress', 'setDeliveryNewAddress',
    'deliveryAddressSaving', 'deliveryAddressError', 'setDeliveryAddressError',
    'handleSaveDeliveryNewAddress',
  ];

  it('destructures exactly the 40 characterized props, under their original names', () => {
    const a = CHILD.indexOf('function NewDeliveryOrder({');
    const b = CHILD.indexOf('}) {', a);
    expect(a, 'component signature').toBeGreaterThan(-1);
    const sig = CHILD.slice(a, b);
    const declared = (sig.match(/^ {2}([A-Za-z0-9_]+),$/gm) || []).map(l => l.trim().replace(',', ''));
    expect(declared).toEqual(EXPECTED_PROPS);
    expect(declared).toHaveLength(40);
  });

  it('the OriginalRegion reference block takes the same 40 props', () => {
    const a = TEST.indexOf('function OriginalRegion({');
    const sig = TEST.slice(a, TEST.indexOf('}) {', a));
    const declared = (sig.match(/^ {2}([A-Za-z0-9_]+),$/gm) || []).map(l => l.trim().replace(',', ''));
    expect(declared).toEqual(EXPECTED_PROPS);
  });

  it('the call site passes every prop explicitly — no spread of the useDelivery object', () => {
    const a = PARENT.indexOf('<NewDeliveryOrder');
    const site = PARENT.slice(a, PARENT.indexOf('/>', a));
    for (const p of EXPECTED_PROPS) {
      expect(site, p).toContain(`${p}={${p}}`);
    }
    expect(site).not.toContain('{...');
  });

  it('handleOutForDelivery and openQuickCustomerModal are passed as props, never reimplemented', () => {
    expect(PARENT).toContain('handleOutForDelivery={handleOutForDelivery}');
    expect(PARENT).toContain('openQuickCustomerModal={openQuickCustomerModal}');
    expect(PARENT).toContain('const handleOutForDelivery = useCallback(async () => {');
    expect(PARENT).toContain('const openQuickCustomerModal = useCallback(');
    expect(CHILD).not.toContain('const handleOutForDelivery');
    expect(CHILD).not.toContain('const openQuickCustomerModal');
  });

  it('the child calls no hooks, declares no state, no effects and no refs', () => {
    for (const forbidden of ['useState(', 'useEffect(', 'useRef(', 'useMemo(', 'useCallback(',
      'useReducer(', 'useContext(', 'React.memo']) {
      expect(CHILD, forbidden).not.toContain(forbidden);
    }
  });

  it('the child never imports or calls useDelivery, a checkout/session/printing hook, or an API', () => {
    // Prose in the header comment may NAME useDelivery; what must not exist is an import of it or
    // a call to it (same for every other feature hook and for any api/ module).
    for (const hook of ['useDelivery', 'useCheckout', 'usePosSession', 'useSessionClosure',
      'usePosPrinting', 'useLayaway', 'useCart', 'useProductEntry', 'useProductCatalog']) {
      expect(CHILD, `${hook}(`).not.toContain(`${hook}(`);
      expect(CHILD, `import ${hook}`).not.toMatch(new RegExp(`import[^\\n]*${hook}[^\\n]*from`));
    }
    for (const forbidden of ['axios', "from '../../../../../api", '/api/', 'Api(', 'fetch(']) {
      expect(CHILD, forbidden).not.toContain(forbidden);
    }
    expect(CHILD.match(/^import /gm)).toHaveLength(4);
  });

  it('the child imports only React, its icons, WALK_IN_CUSTOMER and DeliveryPersonSelect', () => {
    expect(CHILD).toContain("import React from 'react';");
    expect(CHILD).toContain("from 'lucide-react';");
    expect(CHILD).toContain("import { WALK_IN_CUSTOMER } from '../../posConstants';");
    expect(CHILD).toContain("import DeliveryPersonSelect from './DeliveryPersonSelect';");
    expect(CHILD.match(/<DeliveryPersonSelect[\s/>]/g) || []).toHaveLength(1);
  });

  it('POSSales renders it from exactly one call site, still guarded by showDeliveryModal', () => {
    expect(PARENT.split('<NewDeliveryOrder').length - 1).toBe(1);
    expect(PARENT).toContain("import NewDeliveryOrder from './POS/features/delivery/NewDeliveryOrder';");
    expect(PARENT).toContain('{showDeliveryModal && (\n        <NewDeliveryOrder');
    // The parent guard is the only mount/unmount switch for the capture modal.
    expect(CHILD).not.toContain('{showDeliveryModal && (\n');
    // No key, no memo wrapper, no inline component around the call site.
    expect(PARENT).not.toContain('<NewDeliveryOrder key=');
  });

  it('the call site stays between the POS config panel and the Delivery Settlement modal', () => {
    const cfg = PARENT.indexOf('{showPOSConfig && (');
    const site = PARENT.indexOf('<NewDeliveryOrder');
    const settle = PARENT.indexOf('{showDeliverySettleModal && (() => {');
    expect(cfg).toBeGreaterThan(-1);
    expect(site).toBeGreaterThan(cfg);
    expect(settle).toBeGreaterThan(site);
  });

  it('Delivery Settlement stayed inline in POSSales and is NOT inside the child', () => {
    expect(PARENT).toContain('{showDeliverySettleModal && (() => {');
    for (const settlement of ['deliverySettlePayment', 'deliverySettleFields', 'deliverySettleSearch',
      'deliverySettlePersonFilter', 'deliverySettleSelected', 'deliveryOrders', 'showDeliverySettleModal']) {
      expect(CHILD, `settlement must not leak into the child: ${settlement}`).not.toContain(settlement);
    }
  });

  it('useDelivery ownership stayed in POSSales', () => {
    expect(PARENT).toContain('} = useDelivery({');
    expect(PARENT.split('useDelivery(').length - 1).toBe(1);
    // handleSaveDeliveryNewAddress is still destructured out of useDelivery in POSSales.
    expect(PARENT).toMatch(/\n {4}handleSaveDeliveryNewAddress,\n/);
  });

  it('the child body is the characterized region copied verbatim', () => {
    const startMarker = '      {/* REGION-VERBATIM-START */}\n';
    const a = TEST.indexOf(startMarker);
    const b = TEST.indexOf('      {/* REGION-VERBATIM-END */}');
    expect(a, 'verbatim markers').toBeGreaterThan(-1);
    const reference = TEST.slice(a + startMarker.length, b);
    expect(reference.split('\n')).toHaveLength(324); // 323 source lines + the trailing empty split
    const openTag = '  return (\n    <>\n';
    const childBody = CHILD.slice(CHILD.indexOf(openTag) + openTag.length, CHILD.lastIndexOf('    </>\n'));
    expect(childBody).toBe(reference);
  });
});
