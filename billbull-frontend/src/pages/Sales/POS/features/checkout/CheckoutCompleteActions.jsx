// Extracted verbatim from POSSales.jsx (checkout COMPLETE phase — action block).
// Presentation only: New Sale, Print Receipt, Reprint Inv. and the three Share Receipt buttons.
// Every handler is supplied by POSSales; closeComplete, the Print Receipt async body, the reprint
// and share-channel state, and ReceiptShareModal all stay there.

import React from 'react';
import { ArrowRightCircle, Mail, MessageCircle, Printer, RotateCcw, Smartphone } from 'lucide-react';

function CheckoutCompleteActions({
  onNewSale,
  onPrintReceipt,
  onReprint,
  onShare,
}) {
  return (
                <div className="px-6 pb-6 pt-4 bg-white border-t border-gray-50 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.02)]">
                  {/* Primary Action */}
                  <button type="button" onClick={onNewSale}
                    className="w-full py-3.5 mb-3 rounded-xl bg-[#F5C742] hover:bg-[#E5B532] text-white font-black text-sm transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <ArrowRightCircle className="h-5 w-5" />New Sale
                  </button>

                  {/* Secondary Actions */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button type="button" onClick={onPrintReceipt}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <Printer className="h-4 w-4" />Print Receipt
                    </button>
                    <button type="button" onClick={onReprint}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      <RotateCcw className="h-4 w-4" />Reprint Inv.
                    </button>
                  </div>

                  {/* Share Receipt - Tertiary (Figma style preserved) */}
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Share Receipt</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'sms', label: 'SMS', Icon: Smartphone, tone: 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500' },
                        { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, tone: 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-100 hover:border-green-300 focus-visible:ring-green-500' },
                        { key: 'email', label: 'Email', Icon: Mail, tone: 'border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 hover:border-blue-300 focus-visible:ring-blue-500' },
                      ].map(({ key, label, Icon, tone }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onShare(key)}
                          className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${tone}`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
  );
}

export default CheckoutCompleteActions;
