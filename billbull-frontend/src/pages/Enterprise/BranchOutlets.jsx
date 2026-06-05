import React, { useState, useEffect, useMemo } from 'react';
import { 
    Building2, Plus, Pencil, Trash2, Star, StarOff, Check, X, Crown, 
    Search, LayoutGrid, List, MapPin, Phone, Mail, User, FileText, ToggleLeft, ToggleRight, Eye, Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    getBranches, createBranch, updateBranch, setDefaultBranch, deleteBranch,
    setHeadquartersBranch, uploadBranchLogo, uploadBranchStamp
} from '../../api/branchApi';
import { getWarehouses } from '../../api/warehouseApi';
import { getImageUrl } from '../../utils/urlUtils';
import { useBranch } from '../../context/BranchContext';
import PaginationFooter from '../../components/common/PaginationFooter';

const EMPTY_FORM = {
    name: '',
    code: '',
    type: 'BRANCH',
    isHeadquarters: false,
    address: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    phone: '',
    mobile: '',
    fax: '',
    email: '',
    website: '',
    trnNumber: '',
    bankName: '',
    bankAccountNumber: '',
    bankIban: '',
    bankSwift: '',
    logoUrl: '',
    stampUrl: '',
    logoFile: null,
    stampFile: null,
    sortOrder: 0,
    defaultWarehouseId: '',
    // Mock fields for the new UI requirements
    status: 'active',
    parentBranch: '',
    openingDate: '',
    notes: '',
    manager: '',
};

const BRANCH_TYPES = [
    { value: 'HEADQUARTERS', label: 'Headquarters' },
    { value: 'BRANCH', label: 'Branch' },
    { value: 'OUTLET', label: 'Outlet' },
    { value: 'SHOWROOM', label: 'Showroom' },
    { value: 'WAREHOUSE', label: 'Warehouse' },
];

const TABS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'address', label: 'Address & Contact' },
    { id: 'business', label: 'Business Details' },
    { id: 'assets', label: 'Assets' },
];

const FILTERS = ['All', 'Headquarters', 'Branch', 'Outlet', 'Showroom', 'Warehouse'];

const BranchOutlets = () => {
    const { refreshDefaultBranch } = useBranch();
    const [branches, setBranches] = useState([]);
    const LIST_PAGE_SIZE = 30;
    const [listPage, setListPage] = useState(0);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // New UI state
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [viewMode, setViewMode] = useState('grid');
    const [activeTab, setActiveTab] = useState('basic');
    const [viewingBranch, setViewingBranch] = useState(null);
    const [detailsTab, setDetailsTab] = useState('overview');

    const branchWarehouses = useMemo(() => {
        if (!editId) return [];
        return warehouses.filter(w => w.branchId === editId);
    }, [warehouses, editId]);

    const load = async () => {
        setLoading(true);
        try {
            const [br, wh] = await Promise.all([getBranches(), getWarehouses()]);
            setBranches(br);
            setWarehouses(wh);
        } catch {
            toast.error('Failed to load branches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Filter branches
    const filteredBranches = useMemo(() => {
        return branches.filter(b => {
            const matchesFilter = activeFilter === 'All' || (b.type || 'BRANCH').toUpperCase() === activeFilter.toUpperCase();
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm || 
                (b.name && b.name.toLowerCase().includes(searchLower)) ||
                (b.code && b.code.toLowerCase().includes(searchLower)) ||
                (b.city && b.city.toLowerCase().includes(searchLower));
            return matchesFilter && matchesSearch;
        });
    }, [branches, activeFilter, searchTerm]);

    const pagedBranches = filteredBranches.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

    // Calculate stats
    const stats = useMemo(() => {
        const total = branches.length;
        // Assuming status exists in your actual data or defaulting to active for now
        const active = branches.filter(b => b.status !== 'inactive').length;
        const inactive = total - active;
        const types = new Set(branches.map(b => b.type || 'BRANCH')).size;
        return { total, active, inactive, types };
    }, [branches]);

    const openAdd = () => {
        setEditId(null);
        setForm(EMPTY_FORM);
        setActiveTab('basic');
        setShowForm(true);
    };

    const openEdit = (b) => {
        setEditId(b.id);
        setForm({
            name: b.name || '',
            code: b.code || '',
            type: b.type || 'BRANCH',
            isHeadquarters: Boolean(b.isHeadquarters),
            address: b.address || '',
            addressLine2: b.addressLine2 || '',
            addressLine3: b.addressLine3 || '',
            city: b.city || '',
            state: b.state || '',
            country: b.country || '',
            postalCode: b.postalCode || '',
            phone: b.phone || '',
            mobile: b.mobile || '',
            fax: b.fax || '',
            email: b.email || '',
            website: b.website || '',
            trnNumber: b.trnNumber || '',
            bankName: b.bankName || '',
            bankAccountNumber: b.bankAccountNumber || '',
            bankIban: b.bankIban || '',
            bankSwift: b.bankSwift || '',
            logoUrl: b.logoUrl || '',
            stampUrl: b.stampUrl || '',
            logoFile: null,
            stampFile: null,
            sortOrder: b.sortOrder ?? 0,
            defaultWarehouseId: b.defaultWarehouseId || '',
            // Mocks
            status: b.status || 'active',
            parentBranch: b.parentBranch || '',
            openingDate: b.openingDate || '',
            notes: b.notes || '',
            manager: b.manager || '',
        });
        setActiveTab('basic');
        setShowForm(true);
    };

    const handleFileUpload = (e, fieldName) => {
        const file = e.target.files[0];
        if (file) {
            setForm(f => ({ ...f, [fieldName + 'File']: file }));
            const reader = new FileReader();
            reader.onloadend = () => {
                setForm(f => ({ ...f, [fieldName + 'Url']: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(EMPTY_FORM);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { toast.error('Branch name is required'); return; }

        if (form.isHeadquarters && !editId) {
            const existing = branches.find(b => b.isHeadquarters);
            if (existing && !window.confirm(
                `"${existing.name}" is currently the Headquarters. Replace it with this new branch?`
            )) return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                code: form.code.trim() || null,
                type: form.type || 'BRANCH',
                isHeadquarters: Boolean(form.isHeadquarters),
                address: form.address.trim() || null,
                addressLine2: form.addressLine2.trim() || null,
                addressLine3: form.addressLine3?.trim() || null,
                city: form.city.trim() || null,
                state: form.state.trim() || null,
                country: form.country.trim() || null,
                postalCode: form.postalCode.trim() || null,
                phone: form.phone.trim() || null,
                mobile: form.mobile?.trim() || null,
                fax: form.fax.trim() || null,
                email: form.email.trim() || null,
                website: form.website?.trim() || null,
                trnNumber: form.trnNumber.trim() || null,
                bankName: form.bankName?.trim() || null,
                bankAccountNumber: form.bankAccountNumber?.trim() || null,
                bankIban: form.bankIban?.trim() || null,
                bankSwift: form.bankSwift?.trim() || null,
                sortOrder: Number(form.sortOrder) || 0,
                defaultWarehouseId: editId && form.defaultWarehouseId ? Number(form.defaultWarehouseId) : null,
                status: form.status,
                parentBranch: form.parentBranch,
                openingDate: form.openingDate,
                notes: form.notes,
                manager: form.manager,
            };
            let savedBranchId = editId;
            if (editId) {
                await updateBranch(editId, payload);
                toast.success('Branch updated');
            } else {
                const res = await createBranch(payload);
                savedBranchId = res.id;
                toast.success('Branch created.');
            }

            if (form.logoFile && savedBranchId) {
                await uploadBranchLogo(savedBranchId, form.logoFile);
            }
            if (form.stampFile && savedBranchId) {
                await uploadBranchStamp(savedBranchId, form.stampFile);
            }

            cancelForm();
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save branch');
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (id) => {
        try {
            await setDefaultBranch(id);
            toast.success('Default branch updated');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to set default');
        }
    };

    const handleSetHeadquarters = async (id, name) => {
        const existing = branches.find(b => b.isHeadquarters && b.id !== id);
        if (existing && !window.confirm(
            `Replace "${existing.name}" with "${name}" as the company Headquarters? Reports with 'All Branches' will use the new HQ's address and branding.`
        )) return;
        try {
            await setHeadquartersBranch(id);
            toast.success('Headquarters updated');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to set headquarters');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this branch? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            await deleteBranch(id);
            toast.success('Branch deleted');
            await load();
            refreshDefaultBranch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete branch');
        } finally {
            setDeletingId(null);
        }
    };

    const handleToggleStatus = async (branch) => {
        const newStatus = (!branch.status || branch.status === 'active') ? 'inactive' : 'active';
        try {
            const payload = {
                name: branch.name,
                code: branch.code,
                type: branch.type,
                isHeadquarters: branch.isHeadquarters,
                address: branch.address,
                addressLine2: branch.addressLine2,
                addressLine3: branch.addressLine3,
                city: branch.city,
                state: branch.state,
                country: branch.country,
                postalCode: branch.postalCode,
                phone: branch.phone,
                mobile: branch.mobile,
                fax: branch.fax,
                email: branch.email,
                website: branch.website,
                trnNumber: branch.trnNumber,
                bankName: branch.bankName,
                bankAccountNumber: branch.bankAccountNumber,
                bankIban: branch.bankIban,
                bankSwift: branch.bankSwift,
                logoUrl: branch.logoUrl,
                sortOrder: branch.sortOrder,
                defaultWarehouseId: branch.defaultWarehouseId,
                status: newStatus,
                parentBranch: branch.parentBranch,
                openingDate: branch.openingDate,
                notes: branch.notes,
                manager: branch.manager,
            };
            await updateBranch(branch.id, payload);
            setBranches(prev => prev.map(b => b.id === branch.id ? { ...b, status: newStatus } : b));
            if (viewingBranch && viewingBranch.id === branch.id) {
                setViewingBranch(prev => ({ ...prev, status: newStatus }));
            }
            toast.success(`Branch marked as ${newStatus}`);
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const getTypeColor = (type, isHq) => {
        if (isHq) return 'bg-yellow-400 border-yellow-400 text-yellow-800';
        switch (type) {
            case 'HEADQUARTERS': return 'bg-yellow-400 border-yellow-400 text-yellow-800';
            case 'OUTLET': return 'bg-green-100 border-green-500 text-green-700';
            case 'SHOWROOM': return 'bg-purple-100 border-purple-500 text-purple-700';
            case 'WAREHOUSE': return 'bg-slate-200 border-slate-500 text-slate-700';
            case 'BRANCH':
            default: return 'bg-blue-50 border-blue-400 text-blue-700';
        }
    };
    
    const getTypeTopBorder = (type, isHq) => {
        if (isHq) return 'border-t-4 border-t-[#F5C742]';
        switch (type) {
            case 'HEADQUARTERS': return 'border-t-4 border-t-[#F5C742]';
            case 'OUTLET': return 'border-t-4 border-t-green-500';
            case 'SHOWROOM': return 'border-t-4 border-t-purple-500';
            case 'WAREHOUSE': return 'border-t-4 border-t-slate-500';
            case 'BRANCH':
            default: return 'border-t-4 border-t-blue-400';
        }
    };

    const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F5C742] bg-white';

    if (viewingBranch) {
        return (
            <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 sticky top-0 z-30 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                        <span>Enterprise Console</span>
                        <span className="text-slate-400">&gt;</span>
                        <button onClick={() => setViewingBranch(null)} className="hover:text-slate-900 transition-colors">Branch / Outlets</button>
                        <span className="text-slate-400">&gt;</span>
                        <span className="font-medium text-slate-900">{viewingBranch.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewingBranch(null)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
                                &larr; Back
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                    {viewingBranch.name}
                                </h1>
                                <div className="flex items-center gap-2 mt-2">
                                    {viewingBranch.code && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded border border-slate-200">{viewingBranch.code}</span>}
                                    {viewingBranch.isHeadquarters && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-semibold rounded-full border border-yellow-200">HQ</span>}
                                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${getTypeColor(viewingBranch.type, viewingBranch.isHeadquarters)}`}>
                                        {viewingBranch.isHeadquarters ? 'Headquarters' : (viewingBranch.type || 'Branch').toLowerCase()}
                                    </span>
                                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${(!viewingBranch.status || viewingBranch.status === 'active') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {viewingBranch.status === 'inactive' ? 'Inactive' : 'Active'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => { setViewingBranch(null); openEdit(viewingBranch); }} className="px-5 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center gap-2">
                            <Pencil size={15} /> Edit
                        </button>
                    </div>
                </div>
    
                <div className="p-4 md:p-6 space-y-6">
                    <div className="flex bg-white p-1 rounded-full w-fit mb-4 border border-slate-200 shadow-sm">
                        <button onClick={() => setDetailsTab('overview')} className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${detailsTab === 'overview' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-600 hover:text-slate-900 border border-transparent'}`}>Overview</button>
                        <button onClick={() => setDetailsTab('contact')} className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${detailsTab === 'contact' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-600 hover:text-slate-900 border border-transparent'}`}>Contact & Address</button>
                        <button onClick={() => setDetailsTab('business')} className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${detailsTab === 'business' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-600 hover:text-slate-900 border border-transparent'}`}>Business Info</button>
                        <button onClick={() => setDetailsTab('assets')} className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${detailsTab === 'assets' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-600 hover:text-slate-900 border border-transparent'}`}>Assets</button>
                    </div>
    
                    {detailsTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h3 className="font-bold text-slate-800 mb-6 text-base">Branch Information</h3>
                                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Branch Name</p>
                                        <p className="text-sm text-slate-800 font-medium">{viewingBranch.name || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Branch Code</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.code || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Branch Type</p>
                                        <p className="text-sm text-slate-800 capitalize">{viewingBranch.isHeadquarters ? 'Headquarters' : (viewingBranch.type || 'Branch').toLowerCase()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Parent Branch</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.parentBranch || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                                        <p className="text-sm text-slate-800 capitalize">{viewingBranch.status || 'active'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Opening Date</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.openingDate || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Currency</p>
                                        <p className="text-sm text-slate-800">AED</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Timezone</p>
                                        <p className="text-sm text-slate-800">Asia/Dubai</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h3 className="font-bold text-slate-800 mb-6 text-base">Branch Manager</h3>
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Manager Name</p>
                                        <p className="text-sm text-slate-800 font-medium">{viewingBranch.manager || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Manager Email</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.email || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Manager Phone</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.phone || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                                        <p className="text-sm text-slate-800">{viewingBranch.notes || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {detailsTab === 'contact' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-slate-800 mb-6 text-base">Contact & Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Full Address</p>
                                    <p className="text-sm text-slate-800">
                                        {[viewingBranch.address, viewingBranch.addressLine2, viewingBranch.addressLine3, viewingBranch.city, viewingBranch.state, viewingBranch.country].filter(Boolean).join(', ') || '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Postal Code</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.postalCode || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.phone || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Mobile</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.mobile || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.email || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Website</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.website ? <a href={viewingBranch.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{viewingBranch.website}</a> : '—'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {detailsTab === 'business' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-slate-800 mb-6 text-base">Business Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tax Registration Number (TRN)</p>
                                    <p className="text-sm text-slate-800">{viewingBranch.trnNumber || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Default Warehouse</p>
                                    <p className="text-sm text-slate-800">{warehouses.find(w => w.id === viewingBranch.defaultWarehouseId)?.name || '—'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {detailsTab === 'assets' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h3 className="font-bold text-slate-800 mb-6 text-base">Assets</h3>
                            {(viewingBranch.logoUrl || viewingBranch.stampUrl) ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {viewingBranch.logoUrl && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Branch Logo</p>
                                            <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-center h-40">
                                                <img src={getImageUrl(viewingBranch.logoUrl)} alt="Branch Logo" className="max-h-full max-w-full object-contain" />
                                            </div>
                                        </div>
                                    )}
                                    {viewingBranch.stampUrl && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Branch Stamp</p>
                                            <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-center h-40">
                                                <img src={getImageUrl(viewingBranch.stampUrl)} alt="Branch Stamp" className="max-h-full max-w-full object-contain" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-500">
                                    <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-sm font-medium">No Assets Uploaded</p>
                                    <p className="text-xs mt-1">Branch logo and stamp will appear here.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                    <span>Enterprise Console</span>
                    <span className="text-slate-400">&gt;</span>
                    <span className="font-medium text-slate-900">Branch / Outlets</span>
                </div>
                <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-slate-700" />
                    <h1 className="text-xl font-bold text-slate-900">Branch / Outlets</h1>
                </div>
            </div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <span className="text-xs text-slate-500 mb-1">Total Branches</span>
                        <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <span className="text-xs text-slate-500 mb-1">Active</span>
                        <span className="text-2xl font-bold text-green-600">{stats.active}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <span className="text-xs text-slate-500 mb-1">Inactive / Suspended</span>
                        <span className="text-2xl font-bold text-slate-600">{stats.inactive}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                        <span className="text-xs text-slate-500 mb-1">Branch Types</span>
                        <span className="text-2xl font-bold text-slate-800">{stats.types}</span>
                    </div>
                </div>

                {/* Filters and Search Bar */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex flex-col md:flex-row items-center gap-4 flex-1">
                        <div className="relative w-full md:max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Search by name, code, city, manager..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {FILTERS.map(f => (
                                <button 
                                    key={f}
                                    onClick={() => {
                                        setActiveFilter(f);
                                        setListPage(0);
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${activeFilter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-start xl:self-auto">
                        <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                            <button 
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-[#FFF9E6] text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button 
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-[#FFF9E6] text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <List size={16} />
                            </button>
                        </div>
                        <button
                            onClick={openAdd}
                            className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-lg transition-colors shadow-sm"
                        >
                            <Plus size={15} /> New Branch
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                {loading ? (
                    <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
                ) : pagedBranches.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
                        No branches found. Try adjusting your filters or search.
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pagedBranches.map(b => (
                                    <div key={b.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${getTypeTopBorder(b.type, b.isHeadquarters)}`}>
                                        <div className="p-5 flex-1 relative">
                                            <div className="absolute top-4 right-4">
                                                <div className="p-2 border border-slate-100 rounded-lg bg-slate-50">
                                                    <Building2 className="h-5 w-5 text-slate-400" />
                                                </div>
                                            </div>
                                            <h3 className="font-bold text-slate-900 text-lg mb-2 pr-10">{b.name}</h3>
                                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                                {b.code && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded">{b.code}</span>}
                                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${getTypeColor(b.type, b.isHeadquarters)}`}>
                                                    {b.isHeadquarters ? 'Headquarters' : (b.type || 'Branch').toLowerCase()}
                                                </span>
                                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${(!b.status || b.status === 'active') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {b.status === 'inactive' ? 'Inactive' : 'Active'}
                                                </span>
                                                {b.isDefault && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full flex items-center gap-1"><Star size={10} fill="currentColor"/> Default</span>}
                                            </div>
                                            
                                            <div className="space-y-3 mt-4 text-xs">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-slate-400 w-16 flex-shrink-0">Parent:</span>
                                                    <span className="text-slate-700">{b.parentBranch || '—'}</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                                    <span className="text-slate-600 leading-tight">
                                                        {[b.address, b.city, b.country].filter(Boolean).join(', ') || 'No address'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                        <span className="text-slate-600 truncate" title={b.phone}>{b.phone || '—'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                        <span className="text-slate-600 truncate" title={b.email}>{b.email || '—'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                    <span className="text-slate-600 truncate">{b.manager || 'No Manager Assigned'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                                    <span className="text-slate-500 font-medium">Tax No:</span>
                                                    <span className="text-slate-700 font-mono">{b.trnNumber || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border-t border-slate-100 p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2 w-full">
                                                <button onClick={() => openEdit(b)} className="flex-1 py-1.5 bg-white border border-slate-200 rounded flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                                                    <Pencil size={12} /> Edit
                                                </button>
                                                <button onClick={() => setViewingBranch(b)} className="flex-1 py-1.5 bg-white border border-slate-200 rounded flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                                                    <Eye size={12} /> Details
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 ml-4">
                                                <button onClick={() => handleToggleStatus(b)} className={`${(!b.status || b.status === 'active') ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'} transition-colors`} title="Toggle Status">
                                                    {(!b.status || b.status === 'active') ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(b.id)}
                                                    disabled={deletingId === b.id || b.isHeadquarters || b.isDefault}
                                                    className="text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Delete Branch"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="bb-nowrap-table w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50">
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Branch</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager</th>
                                            <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                                            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {pagedBranches.map(b => (
                                            <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="font-medium text-slate-800 flex items-center gap-2">
                                                        {b.name}
                                                        {b.isHeadquarters && <Crown size={12} className="text-yellow-500" title="Headquarters" />}
                                                    </div>
                                                    <div className="text-xs text-slate-400">{b.code || '—'}</div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${getTypeColor(b.type, b.isHeadquarters)}`}>
                                                        {(b.type || 'BRANCH').toLowerCase()}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-slate-500 text-xs">
                                                    <div>{b.phone || '—'}</div>
                                                    <div className="text-slate-400">{b.email || ''}</div>
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 text-xs">
                                                    {b.manager || '—'}
                                                </td>
                                                <td className="px-5 py-3 text-center">
                                                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${(!b.status || b.status === 'active') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {b.status === 'inactive' ? 'Inactive' : 'Active'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button onClick={() => setViewingBranch(b)}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                            title="Details">
                                                            <Eye size={14} />
                                                        </button>
                                                        <button onClick={() => handleToggleStatus(b)}
                                                            className={`p-1.5 ${(!b.status || b.status === 'active') ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'} rounded transition-colors`}
                                                            title="Toggle Status">
                                                            {(!b.status || b.status === 'active') ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                                        </button>
                                                        <button onClick={() => openEdit(b)}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                            title="Edit">
                                                            <Pencil size={14} />
                                                        </button>
                                                        {!b.isDefault && !b.isHeadquarters && (
                                                            <button onClick={() => handleDelete(b.id)}
                                                                disabled={deletingId === b.id}
                                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                                                title="Delete">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <PaginationFooter
                            page={listPage}
                            size={LIST_PAGE_SIZE}
                            totalElements={filteredBranches.length}
                            totalPages={Math.ceil(filteredBranches.length / LIST_PAGE_SIZE)}
                            onPageChange={setListPage}
                        />
                    </>
                )}
            </div>

            {/* Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Branch' : 'New Branch'}</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Fill in the details to {editId ? 'update the' : 'create a new'} branch.</p>
                            </div>
                            <button onClick={cancelForm} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex bg-slate-50 p-1 rounded-full w-fit mx-6 mt-2 mb-4">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveTab(t.id)}
                                    className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <form id="branch-form" onSubmit={handleSave} className="space-y-4">
                                {activeTab === 'basic' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Branch Name <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" value={form.name}
                                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                                className={inputCls} placeholder="e.g. Main Store Dubai" required />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Branch Code <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" value={form.code}
                                                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                                className={inputCls} placeholder="BR01" required />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Branch Type <span className="text-red-500">*</span>
                                            </label>
                                            <select value={form.type}
                                                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                                                className={inputCls}>
                                                {BRANCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Parent Branch</label>
                                            <select value={form.parentBranch}
                                                onChange={e => setForm(f => ({ ...f, parentBranch: e.target.value }))}
                                                className={inputCls}>
                                                <option value="">-- None --</option>
                                                {branches.filter(b => b.id !== editId).map(b => (
                                                    <option key={b.id} value={b.name}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                                            <select value={form.status}
                                                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                                className={inputCls}>
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Opening Date</label>
                                            <input type="date" value={form.openingDate}
                                                onChange={e => setForm(f => ({ ...f, openingDate: e.target.value }))}
                                                className={inputCls} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                                            <textarea value={form.notes} rows={3}
                                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                                className={`${inputCls} resize-none`} placeholder="Additional notes about this branch..." />
                                        </div>
                                        <div className="col-span-2 mt-2 pt-4 border-t border-slate-100">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={form.isHeadquarters}
                                                    onChange={e => setForm(f => ({ ...f, isHeadquarters: e.target.checked }))}
                                                    className="h-4 w-4 text-[#F5C742] rounded border-slate-300 focus:ring-[#F5C742]" />
                                                <Crown size={14} className="text-[#F5C742]" />
                                                <span className="text-sm font-medium text-slate-700">Mark as company Headquarters</span>
                                                <span className="text-xs text-slate-400 ml-1">(Used for 'All Branches' reports)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'address' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Address Line 1 <span className="text-red-500">*</span>
                                            </label>
                                            <input type="text" value={form.address}
                                                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                                className={inputCls} placeholder="Dubai Trade Centre" required />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
                                            <input type="text" value={form.addressLine2}
                                                onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                                                className={inputCls} placeholder="Sheikh Zayed Rd" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 3</label>
                                            <input type="text" value={form.addressLine3}
                                                onChange={e => setForm(f => ({ ...f, addressLine3: e.target.value }))}
                                                className={inputCls} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                                            <input type="text" value={form.city}
                                                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                                                className={inputCls} placeholder="Dubai" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                                            <input type="text" value={form.state}
                                                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                                                className={inputCls} placeholder="Dubai" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                                            <input type="text" value={form.country}
                                                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                                                className={inputCls} placeholder="UAE" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Postal Code</label>
                                            <input type="text" value={form.postalCode}
                                                onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))}
                                                className={inputCls} placeholder="00000" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                                            <input type="text" value={form.phone}
                                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                                className={inputCls} placeholder="+971 4 000 0000" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Mobile</label>
                                            <input type="text" value={form.mobile}
                                                onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                                                className={inputCls} placeholder="+971 50 000 0001" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input type="email" value={form.email}
                                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                                className={inputCls} placeholder="hq@billbull.ae" required />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                                            <input type="url" value={form.website}
                                                onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                                                className={inputCls} placeholder="https://billbull.ae" />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'business' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Manager Name</label>
                                            <input type="text" value={form.manager}
                                                onChange={e => setForm(f => ({ ...f, manager: e.target.value }))}
                                                className={inputCls} placeholder="Manager Name" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">TRN Number</label>
                                            <input type="text" value={form.trnNumber}
                                                onChange={e => setForm(f => ({ ...f, trnNumber: e.target.value }))}
                                                className={inputCls} placeholder="TRN1000000000" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Fax</label>
                                            <input type="text" value={form.fax}
                                                onChange={e => setForm(f => ({ ...f, fax: e.target.value }))}
                                                className={inputCls} placeholder="Fax Number" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Default Warehouse</label>
                                            <select
                                                value={form.defaultWarehouseId}
                                                onChange={e => setForm(f => ({ ...f, defaultWarehouseId: e.target.value }))}
                                                disabled={!editId || branchWarehouses.length === 0}
                                                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                                            >
                                                <option value="">-- None --</option>
                                                {branchWarehouses.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name}</option>
                                                ))}
                                            </select>
                                            {!editId && (
                                                <p className="mt-1 text-[10px] text-amber-600">
                                                    Save branch first to assign a warehouse.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Sort Order</label>
                                            <input type="number" value={form.sortOrder}
                                                onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                                                className={inputCls} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Logo URL</label>
                                            <input type="text" value={form.logoUrl}
                                                onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                                                className={inputCls} placeholder="/uploads/logos/branch-x.png" />
                                        </div>

                                        <div className="col-span-2 mt-2 pt-4 border-t border-slate-100">
                                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Bank Details</h4>
                                            <p className="text-[11px] text-slate-400 mb-3">Printed in the document footer (Bank Details section) for this branch's transactions.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                                            <input type="text" value={form.bankName}
                                                onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                                                className={inputCls} placeholder="Emirates NBD" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                                            <input type="text" value={form.bankAccountNumber}
                                                onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                                                className={inputCls} placeholder="1012345678" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">IBAN</label>
                                            <input type="text" value={form.bankIban}
                                                onChange={e => setForm(f => ({ ...f, bankIban: e.target.value }))}
                                                className={inputCls} placeholder="AE07 0330 0000 0102 1450 801" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">SWIFT / BIC</label>
                                            <input type="text" value={form.bankSwift}
                                                onChange={e => setForm(f => ({ ...f, bankSwift: e.target.value }))}
                                                className={inputCls} placeholder="EBILAEAD" />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'assets' && (
                                    <div className="space-y-4">
                                        <p className="text-[11px] text-slate-500 mb-4">Recommended: PNG with transparent background, min 200×200px</p>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Branch Logo</label>
                                                <label className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#F5C742] hover:bg-slate-50 transition-colors h-48 group relative overflow-hidden">
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'logo')} />
                                                    {form.logoUrl ? (
                                                        <img src={getImageUrl(form.logoUrl)} alt="Logo" className="max-h-full max-w-full object-contain" />
                                                    ) : (
                                                        <>
                                                            <Upload className="h-8 w-8 text-slate-300 group-hover:text-[#F5C742] mb-3 transition-colors" />
                                                            <span className="text-xs text-slate-400 group-hover:text-slate-600">Click to upload logo</span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Branch Stamp</label>
                                                <label className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#F5C742] hover:bg-slate-50 transition-colors h-48 group relative overflow-hidden">
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'stamp')} />
                                                    {form.stampUrl ? (
                                                        <img src={getImageUrl(form.stampUrl)} alt="Stamp" className="max-h-full max-w-full object-contain" />
                                                    ) : (
                                                        <>
                                                            <Upload className="h-8 w-8 text-slate-300 group-hover:text-[#F5C742] mb-3 transition-colors" />
                                                            <span className="text-xs text-slate-400 group-hover:text-slate-600">Click to upload stamp</span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 rounded-b-xl">
                            <button type="button" onClick={cancelForm}
                                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button type="submit" form="branch-form" disabled={saving}
                                className="px-5 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-bold rounded-lg disabled:opacity-60 transition-colors shadow-sm">
                                {saving ? 'Saving...' : (editId ? 'Update Branch' : 'Create Branch')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchOutlets;
