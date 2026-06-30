import React from 'react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  Users, Receipt, Wallet, FileText, Search, AlertCircle, CheckCircle,
  DollarSign, Plus, Phone, Download, Printer, ChevronRight,
} from 'lucide-react';
import { saveSalesPayment } from '../../../api/salesPaymentApi';
import { receiptVoucherApi } from '../../../api/receiptVoucherApi';
import { fetchStatementOfAccount } from '../../../api/financialsApi';
import { DirhamSymbol } from './POSCurrency';
import { WALK_IN_CUSTOMER } from './posConstants';
import CustomerPicker from './CustomerPicker';

const CUST_PAGE_SIZE = 30;
const CUST_AVATAR_COLORS = [
  'bg-[#327F74]', 'bg-violet-500', 'bg-blue-500', 'bg-rose-500',
  'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-pink-500',
];
const getCustInitials = (name = '') =>
  name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const getCustAvatarColor = (name = '') =>
  CUST_AVATAR_COLORS[name.charCodeAt(0) % CUST_AVATAR_COLORS.length];

const CustomerView = React.memo(({ customerOptions, posCustomersLoading, setCurrentView, syncPosData }) => {
  const [custTab, setCustTab]             = React.useState('list');
  const [custSearch, setCustSearch]       = React.useState('');
  const [custBalanceFilter, setCustBalanceFilter] = React.useState('all');
  const [custPage, setCustPage]           = React.useState(1);
  const [visited, setVisited]             = React.useState({ list: true, receipt: false, advance: false, statement: false });
  const [receiptCust, setReceiptCust]     = React.useState(null);
  const [advanceCust, setAdvanceCust]     = React.useState(null);
  const [statementCust, setStatementCust] = React.useState(null);

  // Receipt form state
  const [receiptAmount, setReceiptAmount]   = React.useState('');
  const [receiptMethod, setReceiptMethod]   = React.useState('');
  const [receiptRef, setReceiptRef]         = React.useState('');
  const [receiptBusy, setReceiptBusy]       = React.useState(false);
  const [receiptSuccess, setReceiptSuccess] = React.useState(null);

  // Advance form state
  const [advAmount, setAdvAmount]   = React.useState('');
  const [advMethod, setAdvMethod]   = React.useState('');
  const [advNotes, setAdvNotes]     = React.useState('');
  const [advBusy, setAdvBusy]       = React.useState(false);
  const [advSuccess, setAdvSuccess] = React.useState(null);

  // Statement form state
  const [stmtFromDate, setStmtFromDate] = React.useState('');
  const [stmtToDate, setStmtToDate]     = React.useState('');
  const [stmtData, setStmtData]         = React.useState(null);
  const [stmtEntries, setStmtEntries]   = React.useState([]);
  const [stmtBusy, setStmtBusy]         = React.useState(false);
  const [stmtError, setStmtError]       = React.useState(null);

  const handleTabChange = React.useCallback((id) => {
    setCustTab(id);
    setVisited(v => v[id] ? v : { ...v, [id]: true });
  }, []);

  const jumpToStatement = React.useCallback((custId) => {
    setStatementCust(custId);
    handleTabChange('statement');
  }, [handleTabChange]);

  const handleRecordPayment = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === receiptCust);
    if (!selected) return alert('Please select a customer.');
    if (!receiptAmount || Number(receiptAmount) <= 0) return alert('Enter a valid payment amount.');
    if (!receiptMethod) return alert('Please select a payment method.');
    setReceiptBusy(true);
    setReceiptSuccess(null);
    try {
      await saveSalesPayment({
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentType: 'RECEIVED',
        customerCode: selected.code,
        customerName: selected.name,
        amount: Number(receiptAmount),
        paymentMode: receiptMethod,
        referenceNumber: receiptRef || null,
        status: 'COMPLETED',
      });
      setReceiptSuccess(`Payment of ${Number(receiptAmount).toFixed(2)} recorded for ${selected.name}.`);
      setReceiptAmount('');
      setReceiptMethod('');
      setReceiptRef('');
      if (typeof syncPosData === 'function') syncPosData();
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data || 'Failed to record payment.');
    } finally {
      setReceiptBusy(false);
    }
  }, [receiptCust, receiptAmount, receiptMethod, receiptRef, customerOptions, syncPosData]);

  const handleReceiveAdvance = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === advanceCust);
    if (!selected) return alert('Please select a customer.');
    if (!advAmount || Number(advAmount) <= 0) return alert('Enter a valid advance amount.');
    if (!advMethod) return alert('Please select a payment method.');
    setAdvBusy(true);
    setAdvSuccess(null);
    try {
      const payload = {
        date: new Date().toISOString().slice(0, 10),
        memberName: selected.name,
        customerCode: selected.code,
        category: 'Advance Received',
        amount: Number(advAmount),
        paymentMode: advMethod,
        notes: advNotes || null,
        status: 'Completed',
        purpose: 'ADVANCE_RECEIVED',
      };
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      await receiptVoucherApi.create(fd);
      setAdvSuccess(`Advance of ${Number(advAmount).toFixed(2)} received for ${selected.name}.`);
      setAdvAmount('');
      setAdvMethod('');
      setAdvNotes('');
      if (typeof syncPosData === 'function') syncPosData();
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data || 'Failed to record advance.');
    } finally {
      setAdvBusy(false);
    }
  }, [advanceCust, advAmount, advMethod, advNotes, customerOptions, syncPosData]);

  const handleViewStatement = React.useCallback(async () => {
    const selected = customerOptions.find(c => c.id === statementCust);
    if (!selected) return alert('Please select a customer.');
    setStmtBusy(true);
    setStmtError(null);
    setStmtData(null);
    setStmtEntries([]);
    try {
      const from = stmtFromDate || '2000-01-01';
      const to   = stmtToDate   || new Date().toISOString().slice(0, 10);
      const data = await fetchStatementOfAccount('CUSTOMER', selected.code, from, to);
      setStmtData(data);
      setStmtEntries(data?.entries || data?.lines || []);
    } catch (e) {
      setStmtError(e?.response?.data?.message || 'Failed to load statement.');
    } finally {
      setStmtBusy(false);
    }
  }, [statementCust, stmtFromDate, stmtToDate, customerOptions]);

  const realCustomers = React.useMemo(
    () => customerOptions.filter(c => c.id !== WALK_IN_CUSTOMER.id),
    [customerOptions]
  );
  const totalOutstanding = React.useMemo(
    () => realCustomers.reduce((s, c) => s + (c.balance || 0), 0),
    [realCustomers]
  );
  const withBalance = React.useMemo(
    () => realCustomers.filter(c => (c.balance || 0) > 0).length,
    [realCustomers]
  );

  const [deferredSearch, setDeferredSearch] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDeferredSearch(custSearch), 150);
    return () => clearTimeout(t);
  }, [custSearch]);

  const filtered = React.useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return realCustomers.filter(c => {
      const hit = !q || [c.name, c.code, c.membershipId, c.phone, c.email]
        .some(v => v && String(v).toLowerCase().includes(q));
      const bal = c.balance || 0;
      const balOk = custBalanceFilter === 'all' ? true : custBalanceFilter === 'with' ? bal > 0 : bal <= 0;
      return hit && balOk;
    });
  }, [realCustomers, deferredSearch, custBalanceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CUST_PAGE_SIZE));
  const safePage   = Math.min(custPage, totalPages);
  const pageStart  = (safePage - 1) * CUST_PAGE_SIZE;
  const pageRows   = React.useMemo(() => filtered.slice(pageStart, pageStart + CUST_PAGE_SIZE), [filtered, pageStart]);

  const receiptSelected = React.useMemo(
    () => realCustomers.find(c => c.id === receiptCust) || null,
    [realCustomers, receiptCust]
  );

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i}>
          <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0" /><div className="space-y-1.5"><div className="h-3 w-32 bg-gray-200 rounded animate-pulse" /><div className="h-2.5 w-16 bg-gray-100 rounded animate-pulse" /></div></div></td>
          <td className="px-4 py-3"><div className="h-3 w-20 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-3 w-14 bg-gray-200 rounded animate-pulse" /></td>
          <td className="px-4 py-3 text-right"><div className="h-3 w-16 bg-gray-200 rounded animate-pulse ml-auto" /></td>
          <td className="px-4 py-3 text-right"><div className="h-6 w-24 bg-gray-200 rounded animate-pulse ml-auto" /></td>
        </tr>
      ))}
    </>
  );

  return (
    <div className="min-h-full bg-[#F7F7FA]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="text-gray-500 hover:text-[#327F74] cursor-pointer" onClick={() => setCurrentView('dashboard')}>Dashboard</span>
              <ChevronRight className="h-3 w-3 text-gray-400" />
              <span className="text-[#327F74] font-medium">Customer Management</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
              <Users className="h-6 w-6 text-[#327F74]" /> Customer Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">View statements, receive payments, and manage customer advances</p>
          </div>
          <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#327F74] border border-gray-200 hover:border-[#327F74]/40 px-4 py-2 rounded-lg transition-all">
            <ChevronRight className="h-4 w-4 rotate-180" /> Back to Dashboard
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Customers',       val: posCustomersLoading ? '…' : realCustomers.length,  icon: <Users className="h-4 w-4" />,      color: 'bg-[#327F74]/5 border-[#327F74]/20',  text: 'text-[#327F74]',   ic: 'text-[#327F74]' },
            { label: 'Outstanding Balance',    val: posCustomersLoading ? '…' : <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{totalOutstanding.toFixed(2)}</span>, icon: <DollarSign className="h-4 w-4" />, color: 'bg-[#F5C742]/10 border-[#F5C742]/30', text: 'text-[#9A7B00]', ic: 'text-[#9A7B00]' },
            { label: 'Accounts with Balance',  val: posCustomersLoading ? '…' : withBalance,           icon: <AlertCircle className="h-4 w-4" />, color: 'bg-orange-50 border-orange-200',       text: 'text-orange-600',  ic: 'text-orange-500' },
            { label: 'Zero Balance',           val: posCustomersLoading ? '…' : realCustomers.length - withBalance, icon: <CheckCircle className="h-4 w-4" />, color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-600', ic: 'text-emerald-500' },
          ].map(k => (
            <div key={k.label} className={`${k.color} rounded-xl p-3 border`}>
              <div className="flex items-center gap-2 mb-1"><span className={k.ic}>{k.icon}</span><span className="text-xs text-gray-500">{k.label}</span></div>
              <div className={`text-xl font-bold ${k.text} flex items-center gap-1`}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav + Content */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'list',      label: 'Customer List',      icon: <Users className="h-4 w-4" /> },
            { id: 'receipt',   label: 'Customer Receipt',   icon: <Receipt className="h-4 w-4" /> },
            { id: 'advance',   label: 'Receive Advance',    icon: <Wallet className="h-4 w-4" /> },
            { id: 'statement', label: 'Customer Statement', icon: <FileText className="h-4 w-4" /> },
          ].map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${custTab === t.id ? 'border-[#327F74] text-[#327F74]' : 'border-transparent text-gray-500 hover:text-[#1E293B]'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Customer List */}
        <div style={{ display: custTab === 'list' ? 'block' : 'none' }}>
          <div className="py-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setCustPage(1); }}
                  placeholder="Search by name, code, membership, phone…"
                  className="w-full pl-9 pr-4 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 bg-white" />
              </div>
              <select value={custBalanceFilter} onChange={e => { setCustBalanceFilter(e.target.value); setCustPage(1); }}
                className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#327F74]/30">
                <option value="all">All Accounts</option>
                <option value="with">With Balance</option>
                <option value="zero">Zero Balance</option>
              </select>
              <button className="ml-auto h-9 px-4 text-sm font-medium bg-[#327F74] hover:bg-[#2a6b61] text-white rounded-lg flex items-center gap-2 transition-colors" onClick={() => handleTabChange('receipt')}>
                <Plus className="h-4 w-4" /> Add Customer
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F7FA] border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Membership</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {posCustomersLoading ? <SkeletonRows /> : pageRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center"><Search className="h-7 w-7 text-gray-400" /></div>
                        <p className="text-sm font-medium text-gray-500">{deferredSearch ? `No results for "${custSearch}"` : 'No customers found'}</p>
                        {deferredSearch && <button onClick={() => setCustSearch('')} className="text-xs text-[#327F74] underline">Clear search</button>}
                      </div>
                    </td></tr>
                  ) : pageRows.map(customer => (
                    <tr key={customer.id} className="hover:bg-[#F7F7FA]/70 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${getCustAvatarColor(customer.name)}`}>{getCustInitials(customer.name)}</div>
                          <div>
                            <div className="font-semibold text-[#1E293B]">{customer.name}</div>
                            {customer.code && <div className="text-xs text-gray-400 font-mono">{customer.code}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.membershipId ? <span className="text-xs font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded">{customer.membershipId}</span> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600"><Phone className="h-3 w-3 text-gray-400 shrink-0" />{customer.phone || <span className="text-gray-400">—</span>}</div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.tier ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${customer.tier === 'Gold' ? 'bg-[#F5C742]/15 text-[#9A7B00]' : customer.tier === 'Silver' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700'}`}>{customer.tier}</span> : <span className="text-xs text-gray-400">Standard</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(customer.balance || 0) > 0 ? <span className="font-semibold text-orange-600 inline-flex items-center gap-0.5"><DirhamSymbol />{(customer.balance || 0).toFixed(2)}</span> : <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Cleared</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => { setReceiptCust(customer.id); handleTabChange('receipt'); }} className="text-xs font-medium text-[#327F74] border border-[#327F74]/30 hover:bg-[#327F74]/5 px-3 py-1.5 rounded-lg transition-colors">View</button>
                          <button onClick={() => jumpToStatement(customer.id)} className="text-xs font-medium text-white bg-[#327F74] hover:bg-[#2a6b61] px-3 py-1.5 rounded-lg transition-colors">Statement</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-[#F7F7FA]/60">
                <span className="text-xs text-gray-500">
                  {posCustomersLoading ? 'Loading…' : filtered.length === 0 ? '0 customers' : `${pageStart + 1}–${Math.min(pageStart + CUST_PAGE_SIZE, filtered.length)} of ${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`}
                  {deferredSearch && !posCustomersLoading && <span className="ml-1 text-[#327F74]">(filtered)</span>}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  <button disabled={safePage <= 1} onClick={() => setCustPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1 : safePage <= 4 ? i + 1 : safePage >= totalPages - 3 ? totalPages - 6 + i : safePage - 3 + i;
                    return <button key={p} onClick={() => setCustPage(p)} className={`w-8 h-7 rounded-lg text-xs font-medium transition-colors ${p === safePage ? 'bg-[#327F74] text-white' : 'border border-gray-200 hover:bg-white text-gray-600'}`}>{p}</button>;
                  })}
                  <button disabled={safePage >= totalPages} onClick={() => setCustPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt — lazy mount */}
        <div style={{ display: custTab === 'receipt' ? 'block' : 'none' }}>
          {visited.receipt && (
            <div className="py-5 max-w-2xl">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#327F74]/5 to-transparent">
                  <div className="p-2 bg-[#327F74]/10 rounded-lg"><Receipt className="h-5 w-5 text-[#327F74]" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Record Customer Payment</h2><p className="text-xs text-gray-500">Receive payment against a customer outstanding balance</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={receiptCust} onChange={setReceiptCust} />
                  </div>
                  {receiptSelected && (
                    <div className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm ${(receiptSelected.balance || 0) > 0 ? 'bg-orange-50 border border-orange-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                      <AlertCircle className={`h-4 w-4 shrink-0 ${(receiptSelected.balance || 0) > 0 ? 'text-orange-500' : 'text-emerald-500'}`} />
                      <div>
                        <span className="font-semibold">{receiptSelected.name}</span>{' — Outstanding: '}
                        {(receiptSelected.balance || 0) > 0
                          ? <span className="font-bold text-orange-600 inline-flex items-center gap-0.5"><DirhamSymbol />{(receiptSelected.balance || 0).toFixed(2)}</span>
                          : <span className="text-emerald-600 font-semibold">Cleared</span>}
                      </div>
                    </div>
                  )}
                  {receiptSuccess && (
                    <div className="rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />{receiptSuccess}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Amount (<DirhamSymbol />)</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><DirhamSymbol /></span><Input type="number" placeholder="0.00" className="pl-8 h-10 border-gray-200" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Method</label>
                      <Select value={receiptMethod} onValueChange={setReceiptMethod}>
                        <SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder="Select method…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">💵 Cash</SelectItem>
                          <SelectItem value="Card">💳 Card</SelectItem>
                          <SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem>
                          <SelectItem value="Cheque">🧾 Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Reference / Notes</label>
                    <Input placeholder="Cheque no., transfer ref, or notes…" className="h-10 border-gray-200" value={receiptRef} onChange={e => setReceiptRef(e.target.value)} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1 bg-[#327F74] hover:bg-[#2a6b61] text-white h-10" disabled={receiptBusy} onClick={handleRecordPayment}><CheckCircle className="h-4 w-4 mr-2" /> {receiptBusy ? 'Saving…' : 'Record Payment'}</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Printer className="h-4 w-4 mr-2" /> Print Receipt</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advance — lazy mount */}
        <div style={{ display: custTab === 'advance' ? 'block' : 'none' }}>
          {visited.advance && (
            <div className="py-5 max-w-2xl">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#F5C742]/10 to-transparent">
                  <div className="p-2 bg-[#F5C742]/15 rounded-lg"><Wallet className="h-5 w-5 text-[#9A7B00]" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Receive Advance Payment</h2><p className="text-xs text-gray-500">Accept advance deposit for future purchases</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={advanceCust} onChange={setAdvanceCust} />
                  </div>
                  {advSuccess && (
                    <div className="rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />{advSuccess}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Advance Amount (<DirhamSymbol />)</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><DirhamSymbol /></span><Input type="number" placeholder="0.00" className="pl-8 h-10 border-gray-200" value={advAmount} onChange={e => setAdvAmount(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-700">Payment Method</label>
                      <Select value={advMethod} onValueChange={setAdvMethod}>
                        <SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder="Select method…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">💵 Cash</SelectItem>
                          <SelectItem value="Card">💳 Card</SelectItem>
                          <SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem>
                          <SelectItem value="Cheque">🧾 Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Purpose / Notes</label>
                    <Input placeholder="e.g. Advance for custom order, layaway deposit…" className="h-10 border-gray-200" value={advNotes} onChange={e => setAdvNotes(e.target.value)} />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />Advance payments are credited to the customer account and applied against future invoices.
                  </div>
                  <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold h-10" disabled={advBusy} onClick={handleReceiveAdvance}><Wallet className="h-4 w-4 mr-2" /> {advBusy ? 'Saving…' : 'Receive Advance'}</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Statement — lazy mount */}
        <div style={{ display: custTab === 'statement' ? 'block' : 'none' }}>
          {visited.statement && (
            <div className="py-5 max-w-3xl space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-transparent">
                  <div className="p-2 bg-indigo-100 rounded-lg"><FileText className="h-5 w-5 text-indigo-600" /></div>
                  <div><h2 className="text-base font-semibold text-[#1E293B]">Generate Customer Statement</h2><p className="text-xs text-gray-500">View transaction history, outstanding balance, and payment summary</p></div>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Select Customer <span className="text-red-500">*</span></label>
                    <CustomerPicker customers={realCustomers} value={statementCust} onChange={setStatementCust} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">From Date</label><Input type="date" className="h-10 border-gray-200" value={stmtFromDate} onChange={e => setStmtFromDate(e.target.value)} /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">To Date</label><Input type="date" className="h-10 border-gray-200" value={stmtToDate} onChange={e => setStmtToDate(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F7F7FA] rounded-lg p-4">
                    {[
                      { label: 'Opening Balance', value: stmtData ? Number(stmtData.openingBalance ?? 0).toFixed(2) : '0.00' },
                      { label: 'Total Invoiced',  value: stmtData ? Number(stmtData.totalInvoiced ?? stmtData.totalDebits ?? 0).toFixed(2) : '0.00' },
                      { label: 'Total Paid',      value: stmtData ? Number(stmtData.totalPaid ?? stmtData.totalCredits ?? 0).toFixed(2) : '0.00' },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className="text-sm font-bold text-[#1E293B] inline-flex items-center gap-0.5"><DirhamSymbol />{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {stmtError && <div className="rounded-lg px-4 py-3 bg-red-50 border border-red-100 text-sm text-red-600">{stmtError}</div>}
                  <div className="flex gap-3 pt-1">
                    <Button className="flex-1 bg-[#327F74] hover:bg-[#2a6b61] text-white h-10" disabled={stmtBusy} onClick={handleViewStatement}><FileText className="h-4 w-4 mr-2" /> {stmtBusy ? 'Loading…' : 'View Statement'}</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Download className="h-4 w-4 mr-2" /> Export PDF</Button>
                    <Button variant="outline" className="border-gray-200 text-gray-600 h-10" disabled><Printer className="h-4 w-4 mr-2" /> Print</Button>
                  </div>
                  {stmtEntries.length > 0 && (
                    <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#F7F7FA] border-b border-gray-100">
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Date</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Description</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Debit</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Credit</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {stmtEntries.map((e, i) => (
                            <tr key={i} className="hover:bg-[#F7F7FA]/50">
                              <td className="px-4 py-2 text-gray-500">{e.date || e.entryDate || '—'}</td>
                              <td className="px-4 py-2 text-[#1E293B]">{e.description || e.reference || e.type || '—'}</td>
                              <td className="px-4 py-2 text-right text-red-600">{(e.debit || e.debitAmount || 0) > 0 ? <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.debit || e.debitAmount || 0).toFixed(2)}</span> : '—'}</td>
                              <td className="px-4 py-2 text-right text-emerald-600">{(e.credit || e.creditAmount || 0) > 0 ? <span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.credit || e.creditAmount || 0).toFixed(2)}</span> : '—'}</td>
                              <td className="px-4 py-2 text-right font-semibold text-[#1E293B]"><span className="inline-flex items-center gap-0.5"><DirhamSymbol />{Number(e.balance || e.runningBalance || 0).toFixed(2)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

CustomerView.displayName = 'CustomerView';

export default CustomerView;
