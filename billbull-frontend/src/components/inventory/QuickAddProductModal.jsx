import React, { useState, useEffect, useRef } from 'react';
import { Package, X, Loader2, AlertTriangle, AlertCircle, Image as ImageIcon, Trash2, Plus } from 'lucide-react';
import ClassificationDropdown from '../ClassificationDropdown';
import CurrencyAmount from '../CurrencyAmount';
import {
    createProduct,
    createProductFromPos,
    validateDuplicateProduct,
    validateDuplicateProductFromPos,
} from '../../api/productsApi';
import { getBrands, createBrand } from '../../api/brandsApi';
import { getDepartments, getSubDepartmentsByDepartment, createDepartment } from '../../api/departmentsApi';
import { createSubDepartment } from '../../api/subDepartmentsApi';
import { getUnits, createUnit } from '../../api/unitsApi';
import { getProductCategories, createProductCategory } from '../../api/productCategoriesApi';

const categoryNames = (list) => (Array.isArray(list) ? list.map(c => c.name).filter(Boolean) : []);
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml'];

const generateCode = () => `PRD${Math.floor(Math.random() * 100000)}`;

const emptyForm = (initialName = '') => ({
    name: initialName,
    code: generateCode(),
    barcode: '',
    brand: '',
    department: '',
    subDepartment: '',
    category: 'General',
    unit: '',
    sellingPrice: '',
    purchasePrice: '',
    taxRate: '',
    trackInventory: true,
    initialStock: '',
    alertQuantity: '',
});

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white';
const labelCls = 'text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block';

const pickDefaultBrand = (brands) =>
    brands.find(b => b.name?.toLowerCase() === 'general') || brands[0] || null;

const pickDefaultUnit = (units) =>
    units.find(u => ['pcs', 'pc', 'piece', 'pieces'].includes(u.name?.toLowerCase())) || units[0] || null;

/**
 * QuickAddProductModal — shared quick-create used by the POS terminal and the
 * back-office ProductSelector, so both create products the same way.
 *
 * Brand / Department / Sub-Department / Category / Unit use the Product
 * module's ClassificationDropdown (search + inline create). An optional image
 * is sent as the "file" multipart part, same as the full Product form.
 *
 * Props:
 *   isOpen, onClose
 *   onCreated(aggregateResponse) – called with the POST /api/products response
 *   onUseExisting(duplicate)     – optional; shows a "use existing" button per duplicate match
 *   source                       – 'pos' routes through the POS-permitted create/duplicate endpoints
 *   title, subtitle, submitLabel, useExistingLabel, initialName
 */
const QuickAddProductModal = ({
    isOpen,
    onClose,
    onCreated,
    onUseExisting = null,
    source = 'backoffice',
    title = 'Quick Add Product',
    subtitle = 'Create a product without leaving this screen',
    submitLabel = 'Save Product',
    useExistingLabel = 'Use Existing',
    initialName = '',
    zIndexClass = 'z-[120]',
}) => {
    const [form, setForm] = useState(() => emptyForm(initialName));
    const [brands, setBrands] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [subDepartments, setSubDepartments] = useState([]);
    const [units, setUnits] = useState([]);
    const [categories, setCategories] = useState([]);
    const [creatingType, setCreatingType] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [duplicates, setDuplicates] = useState(null);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    const isPos = source === 'pos';
    const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    // Reset and load masters every time the modal opens.
    useEffect(() => {
        if (!isOpen) return;
        setForm(emptyForm(initialName));
        setDuplicates(null);
        setError(null);
        setImageFile(null);
        setImagePreview('');
        setSubDepartments([]);

        let cancelled = false;
        Promise.all([
            getBrands().catch(() => []),
            getDepartments().catch(() => []),
            getUnits().catch(() => []),
            getProductCategories().catch(() => []),
        ]).then(([b, d, u, c]) => {
            if (cancelled) return;
            // Inactive brands cannot be used for new products.
            const activeBrands = (Array.isArray(b) ? b : []).filter(x => x.active !== false);
            const activeDepts = (Array.isArray(d) ? d : []).filter(x => x.active !== false);
            const unitList = Array.isArray(u) ? u : [];
            setBrands(activeBrands);
            setDepartments(activeDepts);
            setUnits(unitList);
            setCategories(categoryNames(c));
            setForm(prev => ({
                ...prev,
                brand: prev.brand || pickDefaultBrand(activeBrands)?.id || '',
                unit: prev.unit || pickDefaultUnit(unitList)?.id || '',
            }));
        });
        return () => { cancelled = true; };
    }, [isOpen, initialName]);

    // Sub-departments follow the selected department.
    useEffect(() => {
        if (!isOpen || !form.department) {
            setSubDepartments([]);
            return;
        }
        let cancelled = false;
        getSubDepartmentsByDepartment(form.department)
            .then(list => { if (!cancelled) setSubDepartments(Array.isArray(list) ? list : []); })
            .catch(() => { if (!cancelled) setSubDepartments([]); });
        return () => { cancelled = true; };
    }, [isOpen, form.department]);

    // Release the preview object URL when it is replaced or the modal unmounts.
    useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

    if (!isOpen) return null;

    const handleDepartmentChange = (value) => {
        setForm(prev => ({ ...prev, department: value, subDepartment: '' }));
    };

    const handleInlineCreate = async (type, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setCreatingType(type);
        setError(null);
        try {
            if (type === 'brand') {
                const code = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 10);
                const created = await createBrand({ name: trimmed, code, active: true });
                setBrands(prev => [...prev, created]);
                set('brand', created.id);
            } else if (type === 'department') {
                const created = await createDepartment({ name: trimmed });
                setDepartments(prev => [...prev, created]);
                handleDepartmentChange(created.id);
            } else if (type === 'subDepartment') {
                if (!form.department) return;
                const created = await createSubDepartment({ name: trimmed, departmentId: Number(form.department) });
                setSubDepartments(prev => [...prev, created]);
                set('subDepartment', created.id);
            } else if (type === 'unit') {
                const created = await createUnit({ name: trimmed, symbol: trimmed.substring(0, 5).toUpperCase() });
                setUnits(prev => [...prev, created]);
                set('unit', created.id);
            } else if (type === 'category') {
                const created = await createProductCategory({ name: trimmed });
                setCategories(prev => (prev.includes(created.name) ? prev : [...prev, created.name]));
                set('category', created.name);
            }
        } catch (err) {
            setError(err.response?.data?.message || `Failed to create ${type}. Please try again.`);
        } finally {
            setCreatingType(null);
        }
    };

    const handleImagePick = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setError('Only JPG, PNG, and SVG images are allowed.');
            return;
        }
        setError(null);
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const clearImage = () => {
        setImageFile(null);
        setImagePreview('');
    };

    const canSave = !!(form.name.trim() && form.code.trim() && form.sellingPrice !== '' && form.brand && form.unit);

    const handleSave = async (overrideDuplicate = false) => {
        if (!canSave || saving) return;
        setSaving(true);
        setError(null);
        try {
            if (!overrideDuplicate) {
                const check = isPos ? validateDuplicateProductFromPos : validateDuplicateProduct;
                const found = await check({ name: form.name.trim(), code: form.code.trim(), barcode: form.barcode.trim() });
                if (Array.isArray(found) && found.length > 0) {
                    setDuplicates(found);
                    return;
                }
            }

            const unitId = Number(form.unit);
            const sellingPrice = parseFloat(form.sellingPrice) || 0;
            const purchasePrice = parseFloat(form.purchasePrice) || 0;
            const payload = {
                product: {
                    name: form.name.trim(),
                    code: form.code.trim(),
                    category: form.category || 'General',
                    status: 'ACTIVE',
                    productType: 'STOCK',
                    isBatch: false,
                    isSerial: false,
                    isDiscountAllowed: true,
                    availableInPos: true,
                    brand: { id: Number(form.brand) },
                    department: form.department ? { id: Number(form.department) } : null,
                    subDepartment: form.subDepartment ? { id: Number(form.subDepartment) } : null,
                },
                pricing: {
                    retailPrice: sellingPrice,
                    cost: purchasePrice,
                    purchasePrice,
                },
                // Blank means "not configured" -> Sales falls back to the branch's Default VAT
                // Rate; an explicit 0 is sent through as a zero-rated item. No Purchase Tax input
                // here, so it stays unset (Purchase flows fall back to 0%).
                tax: {
                    salesTax: form.taxRate === '' ? null : Number(form.taxRate),
                    purchaseTax: null,
                },
                inventory: {
                    openingStock: form.trackInventory ? (parseFloat(form.initialStock) || 0) : 0,
                    minStock: form.trackInventory ? (parseFloat(form.alertQuantity) || 0) : 0,
                    trackInventory: form.trackInventory,
                    allowNegativeStock: true,
                    defaultUnit: { id: unitId },
                    packings: [{
                        level: 'L1',
                        unit: unitId,
                        conversion: 1,
                        baseQty: 1,
                        isSale: true,
                        isPurchase: true,
                        isLPO: false,
                        cost: purchasePrice,
                        price: sellingPrice,
                        barcode: form.barcode.trim(),
                    }],
                },
            };

            const fd = new FormData();
            fd.append('data', JSON.stringify(payload));
            if (imageFile) fd.append('file', imageFile);

            const res = await (isPos ? createProductFromPos(fd) : createProduct(fd));
            await onCreated?.(res);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to create product');
        } finally {
            setSaving(false);
        }
    };

    const hasDuplicates = Array.isArray(duplicates) && duplicates.length > 0;

    return (
        // Keys typed here must not reach the host's handlers (ProductSelector closes on
        // Escape, POS has global shortcuts) — only this modal's own controls react to them.
        <div
            className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200`}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="bg-[#F5C742] px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-[#1E293B]">
                            <Package className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-wide text-[#1E293B]">{title}</h2>
                            {subtitle && <p className="text-xs text-[#1E293B]/70 mt-0.5">{subtitle}</p>}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} className="text-[#1E293B]/70 hover:text-[#1E293B] transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {hasDuplicates && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-inner space-y-3">
                            <div className="flex items-center gap-2.5 text-amber-800">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                                <h3 className="text-sm font-bold">Potential Duplicate Products Detected!</h3>
                            </div>
                            <p className="text-xs text-amber-800/90">
                                We found existing products matching the name, code, or barcode you entered:
                            </p>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                {duplicates.map(dup => (
                                    <div key={dup.id} className="bg-white border border-amber-200/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate">{dup.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Code: {dup.code || 'N/A'} {dup.barcode ? `| Barcode: ${dup.barcode}` : ''} | Price:{' '}
                                                <CurrencyAmount value={dup.sellingPrice ?? 0} />
                                            </p>
                                        </div>
                                        {onUseExisting && (
                                            <button type="button" onClick={() => onUseExisting(dup)}
                                                className="shrink-0 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors shadow-sm">
                                                {useExistingLabel}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-amber-700 italic pt-1 border-t border-amber-200/60">
                                Or, if this is a distinct product variant, you can proceed to create a new item below.
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Image + identity */}
                    <div className="flex gap-4">
                        <div className="shrink-0">
                            <label className={labelCls}>Image</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="relative w-28 h-28 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 hover:border-[#F5C742] transition-colors cursor-pointer overflow-hidden"
                                title="Upload product image"
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Product preview" className="w-full h-full object-contain" />
                                ) : (
                                    <>
                                        <ImageIcon className="h-6 w-6" />
                                        <span className="text-[10px] font-semibold mt-1">Upload</span>
                                        <span className="text-[9px] text-gray-300">JPG, PNG, SVG</span>
                                    </>
                                )}
                                {imagePreview && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); clearImage(); }}
                                        className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-red-500 hover:bg-red-50 shadow"
                                        title="Remove image">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg" className="hidden" onChange={handleImagePick} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                            <div>
                                <label className={labelCls}>Product Name <span className="text-red-500">*</span></label>
                                <input autoFocus type="text" value={form.name} onChange={e => set('name', e.target.value)}
                                    placeholder="Enter item name" className={inputCls} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Item Code / SKU <span className="text-red-500">*</span></label>
                                    <input type="text" value={form.code} onChange={e => set('code', e.target.value)}
                                        placeholder="e.g. PRD-001" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Barcode (EAN/UPC)</label>
                                    <input type="text" value={form.barcode} onChange={e => set('barcode', e.target.value)}
                                        placeholder="Scan or type barcode" className={inputCls} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Classification */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Brand <span className="text-red-500">*</span></label>
                            <ClassificationDropdown
                                options={brands.map(b => ({ value: b.id, label: b.name }))}
                                value={form.brand}
                                onChange={(v) => set('brand', v)}
                                onCreateNew={(name) => handleInlineCreate('brand', name)}
                                placeholder="Select Brand…"
                                creating={creatingType === 'brand'}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Category</label>
                            <ClassificationDropdown
                                /* 'General' stays pickable even before the list loads; the backend
                                   registers it on save if this tenant has no such row. */
                                options={[...new Set(['General', ...categories])].map(c => ({ value: c, label: c }))}
                                value={form.category}
                                onChange={(v) => set('category', v)}
                                onCreateNew={(name) => handleInlineCreate('category', name)}
                                placeholder="Select Category…"
                                creating={creatingType === 'category'}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Department</label>
                            <ClassificationDropdown
                                options={departments.map(d => ({ value: d.id, label: d.name }))}
                                value={form.department}
                                onChange={handleDepartmentChange}
                                onCreateNew={(name) => handleInlineCreate('department', name)}
                                placeholder="Select Department…"
                                creating={creatingType === 'department'}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Sub-Department</label>
                            <ClassificationDropdown
                                options={subDepartments
                                    .filter(sd => sd.active !== false || Number(sd.id) === Number(form.subDepartment))
                                    .map(sd => ({ value: sd.id, label: sd.name }))}
                                value={form.subDepartment}
                                onChange={(v) => set('subDepartment', v)}
                                onCreateNew={form.department ? (name) => handleInlineCreate('subDepartment', name) : undefined}
                                placeholder={form.department ? 'Select Sub-Department…' : 'Select a Department first'}
                                disabled={!form.department}
                                creating={creatingType === 'subDepartment'}
                                noCreateMsg={form.department ? 'No sub-departments found' : 'Select a Department first'}
                            />
                        </div>
                    </div>

                    {/* Pricing & unit */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                        <div>
                            <label className={labelCls}>Selling Price <span className="text-red-500">*</span></label>
                            <input type="number" min="0" step="0.01" value={form.sellingPrice}
                                onChange={e => set('sellingPrice', e.target.value)} placeholder="0.00" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Purchase Cost</label>
                            <input type="number" min="0" step="0.01" value={form.purchasePrice}
                                onChange={e => set('purchasePrice', e.target.value)} placeholder="0.00" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Default Unit <span className="text-red-500">*</span></label>
                            <ClassificationDropdown
                                options={units.map(u => ({ value: u.id, label: u.name }))}
                                value={form.unit}
                                onChange={(v) => set('unit', v)}
                                onCreateNew={(name) => handleInlineCreate('unit', name)}
                                placeholder="Select Unit…"
                                creating={creatingType === 'unit'}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Sales Tax (%)</label>
                            <input type="number" min="0" max="100" step="0.01" placeholder="Branch default"
                                value={form.taxRate} onChange={e => set('taxRate', e.target.value)} className={inputCls} />
                            <p className="text-[10px] text-gray-400 mt-1">Leave blank to use the branch's Default VAT Rate. Enter 0 for zero-rated.</p>
                        </div>
                    </div>

                    {/* Inventory */}
                    <div className="border-t border-gray-100 pt-3 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input type="checkbox" checked={form.trackInventory}
                                onChange={e => set('trackInventory', e.target.checked)}
                                className="w-4 h-4 text-[#e6b838] border-gray-300 rounded focus:ring-[#F5C742]" />
                            <span className="text-sm font-bold text-gray-800">Track Inventory / Stock Levels</span>
                        </label>
                        {form.trackInventory && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Initial Stock Quantity</label>
                                    <input type="number" min="0" value={form.initialStock}
                                        onChange={e => set('initialStock', e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Low Stock Alert Quantity</label>
                                    <input type="number" min="0" value={form.alertQuantity}
                                        onChange={e => set('alertQuantity', e.target.value)} placeholder="5" className={inputCls} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
                    <button type="button" onClick={onClose} disabled={saving}
                        className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
                        Cancel
                    </button>
                    <button type="button" onClick={() => handleSave(hasDuplicates)}
                        disabled={saving || !canSave || !!creatingType}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${hasDuplicates
                            ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20 text-white'
                            : 'bg-[#F5C742] hover:bg-[#e6b838] shadow-[#F5C742]/30 text-[#1E293B]'}`}>
                        {saving
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                            : hasDuplicates ? 'Create New Product Anyway' : <><Plus className="h-4 w-4" /> {submitLabel}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickAddProductModal;
