// Extracted verbatim from POSSales.jsx (New Delivery Order + nested Add-Address region).
// Behaviour is unchanged; only the location moved. Every value below still lives in POSSales:
// the useDelivery hook is still called there, handleOutForDelivery stays there (it couples
// delivery to the print/post path), and openQuickCustomerModal / customerOptions / currentInvoice /
// formatCurrency are the four shared orchestrator values the region already read. This component
// owns no state, no effects, no refs and calls no hooks or APIs.
//
// Delivery Settlement is a separate, high-coupling region and deliberately stays inline in
// POSSales.

import React from 'react';
import { ChevronDown, MapPin, Plus, Search, Star, Truck, X } from 'lucide-react';

import { WALK_IN_CUSTOMER } from '../../posConstants';
import DeliveryPersonSelect from './DeliveryPersonSelect';

function NewDeliveryOrder({
  // shared orchestrator values
  customerOptions,
  currentInvoice,
  formatCurrency,
  openQuickCustomerModal,
  handleOutForDelivery,
  // useDelivery — modal shell
  showDeliveryModal,
  setShowDeliveryModal,
  // useDelivery — customer capture
  deliveryCustomerId,
  setDeliveryCustomerId,
  deliveryCustomerSearch,
  setDeliveryCustomerSearch,
  // useDelivery — address capture
  deliveryAddress,
  setDeliveryAddress,
  deliveryShowAddressPicker,
  setDeliveryShowAddressPicker,
  // useDelivery — schedule / charge / notes
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
  // useDelivery — delivery person
  deliveryPersons,
  deliveryPersonsLoading,
  deliveryDriver,
  setDeliveryDriver,
  // useDelivery — validation / submit
  deliveryValidationErrors,
  setDeliveryValidationErrors,
  deliveryOutLoading,
  // useDelivery — nested Add-Address modal
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
    </>
  );
}

export default NewDeliveryOrder;
