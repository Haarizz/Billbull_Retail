import React, { useMemo, useState } from 'react';
import { PlusCircle, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAccount } from '../../api/ledgerApi';

const ACCOUNT_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity'];

const ACCOUNT_TYPE_MAP = {
  Assets: 'Asset',
  Liabilities: 'Liability',
  Income: 'Income',
  Expenses: 'Expense',
  Equity: 'Equity'
};

const NORMAL_BALANCE_MAP = {
  Assets: 'Dr',
  Expenses: 'Dr',
  Liabilities: 'Cr',
  Income: 'Cr',
  Equity: 'Cr'
};

const DEFAULT_SUB_GROUP_MAP = {
  Assets: 'Current Assets',
  Liabilities: 'Current Liabilities',
  Income: 'Sales',
  Expenses: 'Operating Expenses',
  Equity: 'Equity'
};

const DEFAULT_PARENT_NAME_MAP = {
  Assets: ['Current Assets', 'Assets'],
  Liabilities: ['Current Liabilities', 'Liabilities'],
  Income: ['Sales', 'Income'],
  Expenses: ['Operating Expenses', 'Expenses'],
  Equity: ['Equity']
};

const generateNextCode = (group, existingAccounts = []) => {
  const prefixMap = { Assets: 1, Liabilities: 2, Equity: 3, Income: 4, Expenses: 5 };
  const prefix = prefixMap[group] ?? 9;
  const rangeMin = prefix * 1000;
  const rangeMax = rangeMin + 999;
  const existing = existingAccounts
    .map(account => Number.parseInt(account?.code, 10))
    .filter(code => Number.isFinite(code) && code >= rangeMin && code <= rangeMax);
  const max = existing.length > 0 ? Math.max(...existing) : rangeMin + 99;
  return String(max + 1);
};

const findDefaultParentCode = (group, existingAccounts = []) => {
  const candidates = DEFAULT_PARENT_NAME_MAP[group] || [];
  const groupAccounts = existingAccounts
    .filter(account => Boolean(account?.isGroup))
    .filter(account => !account.status || account.status !== 'archived')
    .filter(account => account.accountGroup === group || account.name === group);

  for (const name of candidates) {
    const match = groupAccounts.find(account => account.name === name);
    if (match?.code) return match.code;
  }

  return groupAccounts[0]?.code || '';
};

const LedgerAccountCreateModal = ({
  isOpen,
  onClose,
  onCreated,
  existingAccounts = [],
  defaultGroup = 'Expenses',
  fixedGroup = false,
  initialName = ''
}) => {
  const [name, setName] = useState(initialName || '');
  const [group, setGroup] = useState(defaultGroup || 'Expenses');
  const [code, setCode] = useState('');
  const [subGroup, setSubGroup] = useState(DEFAULT_SUB_GROUP_MAP[defaultGroup] || '');
  const [openingBalance, setOpeningBalance] = useState('');
  const [balanceType, setBalanceType] = useState(NORMAL_BALANCE_MAP[defaultGroup] || 'Dr');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const nextGroup = defaultGroup || 'Expenses';
    setName(initialName || '');
    setGroup(nextGroup);
    setCode('');
    setSubGroup(DEFAULT_SUB_GROUP_MAP[nextGroup] || '');
    setOpeningBalance('');
    setBalanceType(NORMAL_BALANCE_MAP[nextGroup] || 'Dr');
    setDescription('');
    setSaving(false);
  }, [isOpen, defaultGroup, initialName]);

  const generatedCode = useMemo(
    () => generateNextCode(group, existingAccounts),
    [group, existingAccounts]
  );

  const parentOptions = useMemo(() => {
    return existingAccounts
      .filter(account => Boolean(account?.isGroup))
      .filter(account => !account.status || account.status !== 'archived')
      .filter(account => account.accountGroup === group || account.name === group)
      .sort((left, right) => (left.code || '').localeCompare(right.code || ''));
  }, [existingAccounts, group]);

  if (!isOpen) return null;

  const handleGroupChange = (nextGroup) => {
    setGroup(nextGroup);
    setSubGroup(DEFAULT_SUB_GROUP_MAP[nextGroup] || '');
    setBalanceType(NORMAL_BALANCE_MAP[nextGroup] || 'Dr');
    setCode('');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const finalCode = (code.trim() || generatedCode).trim();

    if (!trimmedName) {
      toast.error('Account name is required.');
      return;
    }
    if (!group) {
      toast.error('Account group is required.');
      return;
    }
    if (existingAccounts.some(account => String(account?.code || '').trim() === finalCode)) {
      toast.error(`Account code ${finalCode} already exists.`);
      return;
    }
    if (existingAccounts.some(account => String(account?.name || '').trim().toLowerCase() === trimmedName.toLowerCase())) {
      toast.error('An account with this name already exists.');
      return;
    }

    const parentCode = findDefaultParentCode(group, existingAccounts);
    const parentAccount = parentCode ? existingAccounts.find(account => account.code === parentCode) : null;
    const normalBalance = NORMAL_BALANCE_MAP[group] || balanceType;

    setSaving(true);
    try {
      const created = await createAccount({
        code: finalCode,
        name: trimmedName,
        subGroup: subGroup.trim() || DEFAULT_SUB_GROUP_MAP[group] || '-',
        accountGroup: group,
        accountType: ACCOUNT_TYPE_MAP[group] || group,
        normalBalance,
        statement: group === 'Income' || group === 'Expenses' ? 'PL' : 'BS',
        parentCode: parentCode || null,
        level: parentAccount ? (parentAccount.level || 1) + 1 : 1,
        isGroup: false,
        branch: 'All Branches',
        costCenterCode: '-',
        balanceAmount: Number.parseFloat(openingBalance || '0') || 0,
        balanceType,
        description,
        status: 'active',
        cashFlag: false,
        allowManualJV: true,
        controlAccount: false,
        costCenterRequired: false
      });
      toast.success('Account ledger created.');
      onCreated?.(created);
      onClose?.();
    } catch (error) {
      console.error('Failed to create account ledger', error);
      toast.error(error.response?.data?.message || 'Failed to create account ledger.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700">
              <PlusCircle size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Create Account Ledger</h3>
              <p className="mt-1 text-xs text-slate-500">Add a ledger account to the chart of accounts.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Account Name <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
              placeholder="Enter account name"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Account Code</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
              placeholder={`Auto ${generatedCode}`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Account Group <span className="text-red-500">*</span></label>
            <select
              value={group}
              onChange={(event) => handleGroupChange(event.target.value)}
              disabled={fixedGroup}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {ACCOUNT_GROUPS.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Sub Group</label>
            <input
              value={subGroup}
              onChange={(event) => setSubGroup(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
              placeholder="e.g. Operating Expenses"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Parent Account</label>
            <select
              value={findDefaultParentCode(group, existingAccounts)}
              disabled
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none"
            >
              <option value="">{parentOptions.length === 0 ? 'None' : 'Auto-selected'}</option>
              {parentOptions.map(account => (
                <option key={account.id || account.code} value={account.code}>{account.code} - {account.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Opening Balance</label>
              <input
                type="number"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Type</label>
              <select
                value={balanceType}
                onChange={(event) => setBalanceType(event.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
              >
                <option value="Dr">Dr</option>
                <option value="Cr">Cr</option>
              </select>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows="2"
              className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-400"
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded bg-[#F5C742] px-4 py-2 text-xs font-bold text-slate-900 shadow-sm hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={14} /> {saving ? 'Creating...' : 'Create Ledger'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LedgerAccountCreateModal;
