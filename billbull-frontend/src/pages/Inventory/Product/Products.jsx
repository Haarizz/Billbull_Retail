import React, { useState, useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode'; // Import Barcode Library
import {
  Package, ChevronRight, Plus, Upload, Download, Search,
  ChevronDown, RefreshCw, SquarePen, Trash2, Eye, X,
  CircleCheckBig, CircleX, Check, Save, ArrowLeft,
  FileText, Share2, Info, Box, Tag, Layers, Barcode,
  Printer, Sparkles, Image as ImageIcon, Globe,
  Calculator, AlertCircle, Filter, MoreHorizontal,
  Clock, DollarSign, TrendingUp, ScanLine, TrendingDown,
  PlusCircle, Loader2, Building2
} from 'lucide-react';

// Import API Methods
import { useNavigate } from 'react-router-dom';
import { getImageUrl } from "../../../utils/urlUtils";
import {
  getProductsList,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  startProductImport,
  getProductImportProgress
} from "../../../api/productsApi";
import { getBrands, createBrand } from "../../../api/brandsApi";
import { usePermissions } from "../../../context/PermissionContext";
import { getDepartments, getSubDepartmentsByDepartment } from "../../../api/departmentsApi";
import { createDepartment } from "../../../api/departmentsApi";
import { createSubDepartment } from "../../../api/subDepartmentsApi";
import { getUnits, createUnit } from "../../../api/unitsApi";
import { getWarehouses } from "../../../api/warehouseApi";
import ClassificationDropdown from "../../../components/ClassificationDropdown";
import { getZones, getLocators, getBins } from "../../../api/warehouseLocationApi";
import { getVendors } from "../../../api/vendorsApi";
import { getBranches } from "../../../api/branchApi";
import { getUnitConversionFactor } from "../../../utils/unitPricing";
import ExportDropdown from '../../../components/common/ExportDropdown';
import { exportToExcel, exportToPDF } from '../../../utils/exportUtils';
import CurrencyAmount, { CurrencySymbol } from '../../../components/CurrencyAmount';
import { getListSerialNumber, withListSerialNumbers } from '../../../utils/serialNumbering';
import { useBranch } from '../../../context/BranchContext';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const PRODUCT_COLUMNS = [
  { header: 'S.No.', key: 'sNo', width: 8 },
  { header: 'Photo', key: 'image', width: 12, type: 'image', imageWidth: 48, imageHeight: 48 },
  { header: 'Product', key: 'name', width: 30 },
  { header: 'Item Description', key: 'description', width: 35 },
  { header: 'Code', key: 'code', width: 15 },
  { header: 'SKU', key: 'sku', width: 15 },
  { header: 'Brand', key: 'brandName', width: 15 },
  { header: 'Department', key: 'departmentName', width: 20 },
  { header: 'Cost', key: 'cost', width: 12 },
  { header: 'Retail Price', key: 'retailPrice', width: 15 },
  { header: 'Status', key: 'status', width: 12 }
];

const mapProductListItem = (d) => ({
  id: d.id,
  code: d.code || '',
  name: d.name || '',
  sku: d.sku || '',
  localName: d.localName,
  description: d.description || d.shortDesc || '',
  status: d.branchStatus || d.status,
  brandName: d.brandName || '',
  brand: d.brandId || '',
  departmentName: d.departmentName || '',
  department: d.departmentId || '',
  cost: d.cost ?? 0,
  retailPrice: d.retailPrice ?? 0,
  image: d.image ? getImageUrl(d.image) : null,
  packings: d.packings || [],
});

const sortProducts = (items, sortBy) => [...items].sort((a, b) => {
  if (sortBy === "Sort by Name") return (a.name || '').localeCompare(b.name || '');
  if (sortBy === "Sort by Code") return (a.code || '').localeCompare(b.code || '');
  if (sortBy === "Sort by Brand") return (a.brandName || '').localeCompare(b.brandName || '');
  return 0;
});

// ==========================================
// 1. DATA CONSTANTS & INITIAL STATE
// ==========================================

const INITIAL_FORM_STATE = {
  id: null,
  name: '',
  code: '',
  localName: '',
  sku: '',
  shortDesc: '',
  detailedDesc: '',
  brand: '',
  department: '',
  subDepartment: '',
  category: '',
  tags: [],
  productType: 'stock',
  isSerial: false,
  batchControlled: false,
  expiryControlled: false,
  fefoEnabled: true,
  minExpiryDaysForSale: 0,
  isWeighing: false,
  isDiscountAllowed: true,
  maxDiscount: 0,

  // IMAGE STATE
  image: null,      // Preview URL (String)
  imageFile: null,  // Actual File Object (Binary)

  status: 'Active',

  cost: '',
  landingCost: 0,
  nlc: 0,
  costMethod: 'FIFO',
  isCostInclusive: false,
  markup: 0,
  gp: 0,
  retailPrice: '',
  wholesalePrice: '',
  minPrice: '',
  maxPrice: '',
  onlinePrice: '',
  purchaseTax: 5,
  salesTax: 5,
  taxCategory: 'Standard',
  hsnCode: '',

  defaultUnit: '',
  reorderLevel: 0,
  reorderUnit: '',
  reorderQty: 0,
  safetyStock: 0,
  minStock: 0,
  maxStock: 0,
  allowNegative: false,
  defaultVendor: '',
  procurementType: 'Normal Purchase',
  warehouse: '',
  zone: '',
  locator: '',
  bin: '',

  packings: [
    {
      id: 1,
      level: 'L1',
      unit: '',
      conversion: 1,
      baseQty: 1,
      isSale: true,
      isPurchase: false,
      isLPO: false,
      cost: 0,
      price: 0,
      barcode: ''
    }
  ],

  useDeptPrefix: false,
  autoAssign: true,
  perBranch: false,
  includePrice: false,
  labelLayout: 'Shelf Label',
  branchPrices: []
};

const STEPS = [
  { id: 1, key: 'general', label: 'General Information', icon: <Box className="h-4 w-4" /> },
  { id: 2, key: 'pricing', label: 'Pricing & Tax', icon: <Tag className="h-4 w-4" /> },
  { id: 3, key: 'inventory', label: 'Inventory & Tracking', icon: <Layers className="h-4 w-4" /> },
  { id: 4, key: 'packings', label: 'Packings & Units', icon: <Box className="h-4 w-4" /> },
  { id: 5, key: 'barcode', label: 'Barcode & Printing', icon: <Barcode className="h-4 w-4" /> },
  { id: 6, key: 'branches', label: 'Branches & Status', icon: <Building2 className="h-4 w-4" /> },
];

const toMoneyNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateGpPercent = (cost, retailPrice) => {
  const c = toMoneyNumber(cost);
  const p = toMoneyNumber(retailPrice);
  if (c <= 0 || p <= 0) return 0;
  return ((p - c) / p * 100);
};

const makeBranchPriceRow = (branch, formData, existing = {}) => {
  const cost = existing.cost ?? formData.cost ?? 0;
  const retailPrice = existing.retailPrice ?? formData.retailPrice ?? 0;
  return {
    id: existing.id ?? null,
    branchId: branch.id,
    branchName: branch.name || `Branch ${branch.id}`,
    branchCode: branch.code || '',
    cost,
    markup: existing.markup ?? formData.markup ?? 0,
    gp: existing.gp ?? calculateGpPercent(cost, retailPrice).toFixed(2),
    retailPrice,
    minPrice: existing.minPrice ?? formData.minPrice ?? 0,
    maxPrice: existing.maxPrice ?? formData.maxPrice ?? 0,
    wholesalePrice: existing.wholesalePrice ?? formData.wholesalePrice ?? 0,
    onlinePrice: existing.onlinePrice ?? formData.onlinePrice ?? 0,
    status: existing.status || 'ACTIVE',
    overridden: existing.overridden != null ? Boolean(existing.overridden) : Boolean(existing.id)
  };
};

const branchPriceSnapshot = (source = {}) => {
  const cost = source.cost ?? 0;
  const retailPrice = source.retailPrice ?? 0;
  return {
    cost,
    markup: source.markup ?? 0,
    gp: source.gp ?? calculateGpPercent(cost, retailPrice).toFixed(2),
    retailPrice,
    minPrice: source.minPrice ?? 0,
    maxPrice: source.maxPrice ?? 0,
    wholesalePrice: source.wholesalePrice ?? 0,
    onlinePrice: source.onlinePrice ?? 0,
    status: source.status || 'ACTIVE'
  };
};

const buildProductPayload = (formData) => {
  return {
    product: {
      id: formData.id,
      code: formData.code,
      name: formData.name,
      localName: formData.localName,
      sku: formData.sku,
      shortDesc: formData.shortDesc,
      detailedDesc: formData.detailedDesc,
      productType: (formData.productType || 'stock').toUpperCase(),
      category: formData.category,
      isSerial: formData.isSerial,
      isBatch: !!formData.batchControlled,
      expiryEnabled: !!formData.expiryControlled,
      fefoEnabled: !!formData.fefoEnabled,
      minExpiryDaysForSale: Math.max(0, Number(formData.minExpiryDaysForSale) || 0),
      isWeighing: formData.isWeighing,
      isDiscountAllowed: formData.isDiscountAllowed,
      maxDiscount: formData.maxDiscount,
      status: (formData.status || 'Active').toUpperCase(),
      brand: formData.brand ? { id: Number(formData.brand) } : null,
      department: formData.department ? { id: Number(formData.department) } : null,
      subDepartment: formData.subDepartment ? { id: Number(formData.subDepartment) } : null
    },
    pricing: {
      cost: formData.cost,
      landingCost: formData.landingCost,
      nlc: formData.nlc,
      costMethod: formData.costMethod,
      isCostInclusive: formData.isCostInclusive,
      retailPrice: formData.retailPrice,
      wholesalePrice: formData.wholesalePrice,
      minPrice: formData.minPrice,
      maxPrice: formData.maxPrice,
      onlinePrice: formData.onlinePrice,
      markup: formData.markup,
      gp: formData.gp
    },
    tax: {
      purchaseTax: formData.purchaseTax,
      salesTax: formData.salesTax,
      taxCategory: formData.taxCategory,
      hsnCode: formData.hsnCode
    },
    inventory: {
      defaultUnit: formData.defaultUnit ? { id: Number(formData.defaultUnit) } : null,
      reorderLevel: formData.reorderLevel,
      reorderUnit: formData.reorderUnit ? { id: Number(formData.reorderUnit) } : null,
      reorderQty: formData.reorderQty,
      safetyStock: formData.safetyStock,
      minStock: formData.minStock,
      maxStock: formData.maxStock,
      allowNegative: formData.allowNegative,
      defaultVendor: formData.defaultVendor ? { id: Number(formData.defaultVendor) } : null,
      procurementType: formData.procurementType,
      warehouse: formData.warehouse ? { id: Number(formData.warehouse) } : null,
      zone: formData.zone ? { id: Number(formData.zone) } : null,
      locator: formData.locator ? { id: Number(formData.locator) } : null,
      bin: formData.bin ? { id: Number(formData.bin) } : null,
      packings: formData.packings.map((pkg, idx) => ({
        ...pkg,
        cost: idx === 0 ? parseFloat(formData.cost || 0) : pkg.cost,
        price: idx === 0 ? parseFloat(formData.retailPrice || 0) : pkg.price,
      }))
    },
    branchPrices: (formData.branchPrices || []).map(row => ({
      id: row.id || null,
      branch: row.branchId ? { id: Number(row.branchId) } : null,
      cost: row.cost,
      markup: row.markup,
      gp: row.gp,
      retailPrice: row.retailPrice,
      minPrice: row.minPrice,
      maxPrice: row.maxPrice,
      wholesalePrice: row.wholesalePrice,
      onlinePrice: row.onlinePrice,
      status: (row.status || 'ACTIVE').toUpperCase()
    })).filter(row => row.branch)
  };
};

const AddProductWizard = ({ onCancel, onSave, initialData, brands: initialBrands, departments: initialDepts, units: initialUnits, warehouses, vendors, branches }) => {
  const { hasAnyRole } = usePermissions();
  const { activeBranchId } = useBranch();
  const isAdmin = hasAnyRole('ADMIN');
  const [currentStep, setCurrentStep] = useState(1);
  const [subDepartments, setSubDepartments] = useState([]);
  const [zones, setZones] = useState([]);
  const [locators, setLocators] = useState([]);
  const [bins, setBins] = useState([]);
  // BB-002: Local copies of master lists so quick-add can extend them
  const [brands, setBrandsLocal] = useState(initialBrands || []);
  const [departments, setDeptsLocal] = useState(initialDepts || []);
  const [units, setUnitsLocal] = useState(initialUnits || []);

  // Inline-create loading indicator — stores which field type is currently being saved
  const [creatingType, setCreatingType] = useState(null);
  // Local category list — no backend entity, stored per session
  const [categoriesLocal, setCategoriesLocal] = useState([
    'General', 'Premium', 'Clearance',
  ]);
  const [formData, setFormData] = useState(() => {
    if (initialData) return { ...initialData, imageFile: null };
    return {
      ...INITIAL_FORM_STATE,
      code: `PRD${Math.floor(Math.random() * 100000)}`,
      defaultUnit: units[0]?.id || '',
      reorderUnit: units[0]?.id || '',
      packings: [
        {
          ...INITIAL_FORM_STATE.packings[0],
          unit: units[0]?.id || ''
        }
      ]
    };
  });

  useEffect(() => {
    if (!Array.isArray(branches) || branches.length === 0) return;
    setFormData(prev => {
      const existingByBranch = new Map((prev.branchPrices || []).map(row => [String(row.branchId), row]));
      const nextRows = branches.map(branch => {
        const existing = existingByBranch.get(String(branch.id));
        if (!existing) return makeBranchPriceRow(branch, prev);
        if (existing.overridden) {
          return {
            ...existing,
            branchName: branch.name || existing.branchName,
            branchCode: branch.code || existing.branchCode || ''
          };
        }
        return makeBranchPriceRow(branch, prev, existing);
      });
      if (JSON.stringify(prev.branchPrices || []) === JSON.stringify(nextRows)) return prev;
      return { ...prev, branchPrices: nextRows };
    });
  }, [branches, formData.cost, formData.markup, formData.gp, formData.retailPrice, formData.minPrice, formData.maxPrice, formData.wholesalePrice, formData.onlinePrice]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadSubs = async () => {
      if (!formData.department) {
        setSubDepartments([]);
        return;
      }
      try {
        const data = await getSubDepartmentsByDepartment(formData.department);
        setSubDepartments(data);
      } catch (err) {
        console.error("Failed to load sub departments", err);
      }
    };
    loadSubs();
  }, [formData.department]);

  // Load Zones when Warehouse changes
  useEffect(() => {
    const loadZones = async () => {
      if (!formData.warehouse) {
        setZones([]);
        return;
      }
      try {
        const data = await getZones(formData.warehouse);
        setZones(data);
      } catch (err) {
        console.error("Failed to load zones", err);
      }
    };
    loadZones();
  }, [formData.warehouse]);

  // Load Locators when Zone changes
  useEffect(() => {
    const loadLocators = async () => {
      if (!formData.zone) {
        setLocators([]);
        return;
      }
      try {
        const data = await getLocators(formData.zone);
        setLocators(data);
      } catch (err) {
        console.error("Failed to load locators", err);
      }
    };
    loadLocators();
  }, [formData.zone]);

  // Load Bins when Locator changes
  useEffect(() => {
    const loadBins = async () => {
      if (!formData.locator) {
        setBins([]);
        return;
      }
      try {
        const data = await getBins(formData.locator);
        setBins(data);
      } catch (err) {
        console.error("Failed to load bins", err);
      }
    };
    loadBins();
  }, [formData.locator]);

  // If brand-wise auto barcode is disabled and no barcode exists, auto-generate using ERP format
  useEffect(() => {
    if (currentStep !== 5) return;
    const hasAnyBarcode = formData.packings?.some(p => (p.barcode || '').trim());
    if (hasAnyBarcode) return;

    const brand = brands.find(b => b.id == formData.brand);
    const brandAuto = brand?.auto === true;
    if (brandAuto) return;

    generateBarcodes({ onlyEmpty: true });
  }, [currentStep, formData.brand, formData.packings, brands]);

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };

      if (field === "department") {
        newData.subDepartment = "";
      }
      if (field === "warehouse") {
        newData.zone = "";
        newData.locator = "";
        newData.bin = "";
      }
      if (field === "zone") {
        newData.locator = "";
        newData.bin = "";
      }
      if (field === "locator") {
        newData.bin = "";
      }
      if (field === "batchControlled") {
        if (value) {
          newData.fefoEnabled = prev.fefoEnabled !== false;
        } else {
          newData.fefoEnabled = false;
          newData.minExpiryDaysForSale = 0;
        }
      }
      if (field === "defaultUnit") {
        // Sync the first packing level's unit to match the selected default unit
        if (newData.packings && newData.packings.length > 0) {
          newData.packings = newData.packings.map((p, idx) =>
            idx === 0 ? { ...p, unit: value } : p
          );
        }
      }

      if (['cost', 'markup', 'retailPrice'].includes(field)) {
        const cost = parseFloat(field === 'cost' ? value : prev.cost) || 0;

        if (field === 'markup') {
          const markupPct = parseFloat(value) || 0;
          const newPrice = cost + (cost * (markupPct / 100));
          newData.retailPrice = newPrice.toFixed(2);
          newData.gp = markupPct ? ((newPrice - cost) / newPrice * 100).toFixed(2) : 0;
        }
        else if (field === 'retailPrice') {
          const price = parseFloat(value) || 0;
          if (cost > 0 && price > 0) {
            const profit = price - cost;
            newData.markup = ((profit / cost) * 100).toFixed(2);
            newData.gp = ((profit / price) * 100).toFixed(2);
          }
        }
        else if (field === 'cost') {
          const markupPct = parseFloat(prev.markup) || 0;
          const newPrice = cost + (cost * (markupPct / 100));
          newData.retailPrice = newPrice.toFixed(2);
        }
      }

      if (['cost', 'markup', 'retailPrice', 'defaultUnit'].includes(field)) {
        const baseCost = parseFloat(newData.cost) || 0;
        const basePrice = parseFloat(newData.retailPrice) || 0;

        newData.packings = (newData.packings || []).map((packing, idx) => {
          const ratio = parseFloat(packing.conversion) || 1;

          return {
            ...packing,
            unit: idx === 0 ? (newData.defaultUnit || packing.unit) : packing.unit,
            baseQty: ratio,
            cost: parseFloat((baseCost * ratio).toFixed(4)),
            price: parseFloat((basePrice * ratio).toFixed(4))
          };
        });
      }
      return newData;
    });
  };

  const handleBranchPriceChange = (branchId, field, value) => {
    setFormData(prev => ({
      ...prev,
      branchPrices: (prev.branchPrices || []).map(row => {
        if (String(row.branchId) !== String(branchId)) return row;
        const next = { ...row, [field]: value, overridden: true };
        const cost = toMoneyNumber(field === 'cost' ? value : next.cost);

        if (field === 'markup') {
          const markupPct = toMoneyNumber(value);
          const retailPrice = cost + (cost * (markupPct / 100));
          next.retailPrice = retailPrice.toFixed(2);
          next.gp = retailPrice > 0 ? (((retailPrice - cost) / retailPrice) * 100).toFixed(2) : 0;
        } else if (field === 'retailPrice') {
          const retailPrice = toMoneyNumber(value);
          if (cost > 0 && retailPrice > 0) {
            next.markup = (((retailPrice - cost) / cost) * 100).toFixed(2);
            next.gp = (((retailPrice - cost) / retailPrice) * 100).toFixed(2);
          } else {
            next.gp = 0;
          }
        } else if (field === 'cost') {
          const markupPct = toMoneyNumber(next.markup);
          const retailPrice = cost + (cost * (markupPct / 100));
          next.retailPrice = retailPrice.toFixed(2);
          next.gp = retailPrice > 0 ? (((retailPrice - cost) / retailPrice) * 100).toFixed(2) : 0;
        }
        return next;
      })
    }));
  };

  const overrideBranchPrice = (branchId) => {
    setFormData(prev => ({
      ...prev,
      branchPrices: (prev.branchPrices || []).map(row => {
        if (String(row.branchId) !== String(branchId)) return row;

        const activeId = activeBranchId && activeBranchId !== 'ALL'
          ? String(activeBranchId)
          : null;
        const sourceRow = activeId
          ? (prev.branchPrices || []).find(item => String(item.branchId) === activeId)
          : null;
        const source = sourceRow || {
          cost: prev.cost,
          markup: prev.markup,
          gp: prev.gp,
          retailPrice: prev.retailPrice,
          minPrice: prev.minPrice,
          maxPrice: prev.maxPrice,
          wholesalePrice: prev.wholesalePrice,
          onlinePrice: prev.onlinePrice,
          status: row.status || 'ACTIVE'
        };

        return {
          ...row,
          ...branchPriceSnapshot(source),
          overridden: true
        };
      })
    }));
  };



  // Inline create handler — used by ClassificationDropdown for Brand/Dept/SubDept/Category
  const handleInlineCreate = async (type, name) => {
    if (!name.trim()) return;
    setCreatingType(type);
    try {
      if (type === 'brand') {
        const rawCode = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const created = await createBrand({ name: name.trim(), code: rawCode.substring(0, 10), active: true });
        setBrandsLocal(prev => [...prev, created]);
        handleInputChange('brand', created.id);
      } else if (type === 'department') {
        const created = await createDepartment({ name: name.trim() });
        setDeptsLocal(prev => [...prev, created]);
        handleInputChange('department', created.id);
      } else if (type === 'subdepartment') {
        if (!formData.department) return;
        const created = await createSubDepartment({ name: name.trim(), departmentId: Number(formData.department) });
        setSubDepartments(prev => [...prev, created]);
        handleInputChange('subDepartment', created.id);
      } else if (type === 'defaultUnit' || type === 'reorderUnit' || type === 'unit' || type.startsWith('packingUnit-')) {
        const created = await createUnit({ name: name.trim(), symbol: name.trim().substring(0, 5).toUpperCase() });
        setUnitsLocal(prev => [...prev, created]);
        if (type === 'defaultUnit' || type === 'reorderUnit') {
          handleInputChange(type, created.id);
        } else if (type.startsWith('packingUnit-')) {
          const pkgId = type.split('-')[1];
          const unitName = created.name.toLowerCase();
          let autoConversion = 1;
          if (unitName.includes('piece') || unitName.includes('pcs') || unitName.includes('pc')) autoConversion = 1;
          else if (unitName.includes('outer')) autoConversion = 6;
          else if (unitName.includes('box')) autoConversion = 12;
          else if (unitName.includes('carton') || unitName.includes('ctn')) autoConversion = 48;

          setFormData(prev => ({
            ...prev,
            packings: prev.packings.map(p =>
              String(p.id) === String(pkgId) ? { ...p, unit: created.id, conversion: autoConversion } : p
            )
          }));
        }
      } else if (type === 'category') {
        const newCat = name.trim();
        setCategoriesLocal(prev => prev.includes(newCat) ? prev : [...prev, newCat]);
        handleInputChange('category', newCat);
      }
    } catch (err) {
      console.error('Inline create failed:', err);
      alert(`Failed to create ${type}. Please try again.`);
    } finally {
      setCreatingType(null);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/svg+xml'].includes(file.type)) {
        alert("Only JPG, PNG, and SVG formats are allowed.");
        return;
      }
      const url = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, image: url, imageFile: file }));
    }
  };

  const handleAiGenerate = () => {
    if (!formData.name) {
      alert("Please enter a Product Name first.");
      return;
    }
    const brandName = brands.find(b => b.id === formData.brand)?.name || 'top industry standards';
    const generatedShort = `${formData.name} - Premium quality product.`;
    const generatedDetailed = `Experience the excellence of ${formData.name}. Manufactured by ${brandName}, ensuring reliability. Ideal for customers seeking quality.`;

    setFormData(prev => ({
      ...prev,
      shortDesc: generatedShort,
      detailedDesc: generatedDetailed
    }));
  };

  const handleBarcodeChange = (pkgId, value) => {
    setFormData(prev => ({
      ...prev,
      packings: prev.packings.map(p => p.id === pkgId ? { ...p, barcode: value } : p)
    }));
  };

  const getBarcodeFormat = (data) => {
    const brand = brands.find(b => b.id == data.brand);
    const prefixValue = (brand?.prefix || brand?.code || data.code || '').toString();
    const prefixLength = brand?.prefixLength || 2;
    const suffixLength = brand?.suffixLength || 8;
    return { prefixValue, prefixLength, suffixLength };
  };

  const buildRandomBarcode = (config, existing) => {
    const prefix = config.prefixValue
      ? (config.prefixValue.length > config.prefixLength
        ? config.prefixValue.substring(0, config.prefixLength)
        : config.prefixValue)
      : '';

    for (let attempt = 0; attempt < 10; attempt++) {
      let suffix = '';
      for (let i = 0; i < config.suffixLength; i++) {
        suffix += Math.floor(Math.random() * 10).toString();
      }
      const candidate = prefix ? `${prefix}-${suffix}` : suffix;
      if (!existing.has(candidate)) return candidate;
    }

    // Fallback if collisions keep happening
    const fallback = prefix ? `${prefix}-${Date.now()}` : `${Date.now()}`;
    return fallback;
  };

  const generateBarcodes = ({ onlyEmpty = false, targetId = null } = {}) => {
    setFormData(prev => {
      const config = getBarcodeFormat(prev);
      const existing = new Set(
        prev.packings.map(p => (p.barcode || '').trim()).filter(Boolean)
      );

      const nextPackings = prev.packings.map(p => {
        if (targetId && p.id !== targetId) return p;
        if (onlyEmpty && p.barcode && p.barcode.trim()) return p;

        const barcode = buildRandomBarcode(config, existing);
        existing.add(barcode);
        return { ...p, barcode };
      });

      return { ...prev, packings: nextPackings };
    });
  };

  const handleGenerateBarcodes = () => {
    generateBarcodes({ onlyEmpty: false });
  };

  const handleGenerateBarcodeForPacking = (pkgId) => {
    generateBarcodes({ onlyEmpty: false, targetId: pkgId });
  };

  const handlePrint = () => { window.print(); };

  const handleAddPacking = () => {
    const nextId = formData.packings.length + 1;
    const newPacking = {
      id: Date.now(),
      level: `L${nextId}`,
      unit: units[0]?.id || '',
      conversion: 1,
      baseQty: 1,
      isSale: false,
      isPurchase: true,
      isLPO: true,
      cost: parseFloat(formData.cost || 0),
      price: parseFloat(formData.retailPrice || 0),
      barcode: ''
    };
    setFormData(prev => ({ ...prev, packings: [...prev.packings, newPacking] }));
  };

  const removePacking = (id) => {
    if (formData.packings.length > 1) {
      setFormData(prev => ({ ...prev, packings: prev.packings.filter(p => p.id !== id) }));
    } else {
      alert("At least one packing level is required.");
    }
  };

  const calculateProfit = () => {
    const price = parseFloat(formData.retailPrice) || 0;
    const cost = parseFloat(formData.cost) || 0;
    return (price - cost).toFixed(2);
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1: return formData.name && formData.code;
      case 2: return formData.cost && formData.retailPrice;
      case 3: return !!formData.defaultUnit;
      case 4: return formData.packings.length > 0;
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length && isStepValid()) setCurrentStep(curr => curr + 1);
  };

  const handleSaveActive = () => onSave({ ...formData, status: 'Active' });
  const handleSaveDraft = () => onSave({ ...formData, status: 'Draft' });

  const selectedBrandForBarcode = brands.find(b => b.id == formData.brand);
  const isAutoBarcode = selectedBrandForBarcode?.auto;
  const allowManual = !isAutoBarcode || (selectedBrandForBarcode?.ruleManualOverride && isAdmin);

  return (
    <div className="min-h-screen bg-[#F7F7FA] font-sans text-slate-900 pb-24 animate-in slide-in-from-right duration-300" >

      {/* HEADER */}
      < div className="bg-white border-b sticky top-0 z-30 px-6 py-4 shadow-sm print:hidden" >
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <button onClick={onCancel} className="hover:text-slate-800 hover:underline">Inventory & Registries</button>
              <span>→</span>
              <span>{initialData ? 'Edit Product' : 'New Product'}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onCancel} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition-colors"><ArrowLeft className="h-6 w-6 text-slate-600" /></button>
              <h1 className="text-2xl font-bold">{initialData ? 'Edit Product / Service' : 'New Product / Service'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {STEPS.map(step => (
              <button
                key={step.id}
                onClick={() => { if (step.id < currentStep) setCurrentStep(step.id); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all
                  ${currentStep === step.id
                    ? 'bg-[#F5C742] border-[#F5C742] text-slate-900 shadow-md transform scale-105'
                    : currentStep > step.id
                      ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 cursor-pointer'
                      : 'bg-white border-slate-200 text-slate-400 opacity-80 cursor-not-allowed'
                  }`}
              >
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.icon}
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div >

      <div className={`p-6 mx-auto space-y-6 ${currentStep === 6 ? 'w-full' : 'max-w-[1600px]'}`}>
        {currentStep === 1 && (
          <div className="grid grid-cols-12 gap-6 animate-in fade-in duration-300">
            <div className="col-span-12 lg:col-span-8 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Box className="h-5 w-5 text-slate-400" /> Basic Product Details</h3>
                  <button onClick={handleAiGenerate} className="flex items-center gap-1.5 text-xs font-medium bg-white border border-[#F5C742] text-amber-600 px-3 py-1.5 rounded-md hover:bg-amber-50 transition-colors shadow-sm">
                    <Sparkles className="h-3.5 w-3.5" /> AI Generate
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Product Code <span className="text-red-500">*</span></label>
                    <input value={formData.code} onChange={(e) => handleInputChange('code', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Product Name <span className="text-red-500">*</span></label>
                    <input value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="e.g. Nike Air Max" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Local / Arabic Name</label>
                    <input value={formData.localName} onChange={(e) => handleInputChange('localName', e.target.value)} placeholder="اسم المنتج" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-right focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">SKU / Internal Code</label>
                    <input value={formData.sku} onChange={(e) => handleInputChange('sku', e.target.value)} placeholder="SKU-12345" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all font-mono" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Short Description (POS / Catalog)</label>
                    <input value={formData.shortDesc} onChange={(e) => handleInputChange('shortDesc', e.target.value)} placeholder="Brief description for POS display" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Detailed Description</label>
                    <textarea value={formData.detailedDesc} onChange={(e) => handleInputChange('detailedDesc', e.target.value)} placeholder="Full product details, specs, features..." className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm h-24 resize-none focus:ring-2 focus:ring-[#F5C742]/50 outline-none transition-all" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Tag className="h-5 w-5 text-slate-400" /> Product Type & Controls</h3>
                <div className="flex items-center gap-6 mb-6 p-3 bg-slate-50 rounded-lg">
                  <label className="text-sm font-medium text-slate-700">Product Type:</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.productType === 'stock' ? 'border-[#F5C742]' : 'border-slate-400'}`}>
                        {formData.productType === 'stock' && <div className="w-2.5 h-2.5 rounded-full bg-[#F5C742]"></div>}
                      </div>
                      <input type="radio" name="ptype" className="hidden" checked={formData.productType === 'stock'} onChange={() => handleInputChange('productType', 'stock')} />
                      <span className="text-sm font-medium group-hover:text-slate-900 transition-colors">Stock Item</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.productType === 'service' ? 'border-[#F5C742]' : 'border-slate-400'}`}>
                        {formData.productType === 'service' && <div className="w-2.5 h-2.5 rounded-full bg-[#F5C742]"></div>}
                      </div>
                      <input type="radio" name="ptype" className="hidden" checked={formData.productType === 'service'} onChange={() => handleInputChange('productType', 'service')} />
                      <span className="text-sm font-medium group-hover:text-slate-900 transition-colors">Service Item</span>
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.isSerial} onChange={(e) => handleInputChange('isSerial', e.target.checked)} />
                    Serial Number Controlled
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.batchControlled} onChange={(e) => handleInputChange('batchControlled', e.target.checked)} />
                    Batch Controlled
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.expiryControlled} onChange={(e) => handleInputChange('expiryControlled', e.target.checked)} />
                    Expiry Controlled
                  </label>
                  <label className={`flex items-center gap-2 text-sm transition-colors ${formData.batchControlled ? 'cursor-pointer text-slate-600 hover:text-slate-900' : 'cursor-not-allowed text-slate-400'}`}>
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.batchControlled && formData.fefoEnabled} disabled={!formData.batchControlled} onChange={(e) => handleInputChange('fefoEnabled', e.target.checked)} />
                    FEFO Enabled
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.isWeighing} onChange={(e) => handleInputChange('isWeighing', e.target.checked)} />
                    Weighing Product (Barcode Scale)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" className="rounded text-[#F5C742] focus:ring-[#F5C742]" checked={formData.isDiscountAllowed} onChange={(e) => handleInputChange('isDiscountAllowed', e.target.checked)} />
                    Discount Allowed
                  </label>
                </div>
                {formData.batchControlled && (
                  <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Min Expiry Days For Sale</label>
                      <input type="number" min="0" value={formData.minExpiryDaysForSale} onChange={(e) => handleInputChange('minExpiryDaysForSale', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#F5C742]/50 outline-none" placeholder="0" />
                    </div>
                    <div className="flex items-center text-xs font-semibold text-slate-500">
                      {formData.fefoEnabled ? 'Auto FEFO' : 'Manual only'}
                    </div>
                  </div>
                )}
                {formData.isDiscountAllowed && (
                  <div className="mt-4 bg-amber-50/50 p-4 rounded-lg border border-amber-100 flex items-center gap-4 animate-in fade-in">
                    <div className="w-full md:w-1/3">
                      <label className="text-xs font-semibold text-slate-500">Maximum Discount %</label>
                      <input type="number" value={formData.maxDiscount} onChange={(e) => handleInputChange('maxDiscount', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#F5C742]/50 outline-none" placeholder="0" />
                    </div>
                    <p className="text-xs text-amber-700 mt-5">Limit the maximum discount cashiers can apply.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2"><Layers className="h-5 w-5 text-slate-400" /> Classification</h3>

                {/* Brand */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Brand</label>
                  <ClassificationDropdown
                    options={brands.map(b => ({ value: b.id, label: b.name }))}
                    value={formData.brand}
                    onChange={(val) => handleInputChange('brand', val)}
                    onCreateNew={(name) => handleInlineCreate('brand', name)}
                    placeholder="Select Brand…"
                    creating={creatingType === 'brand'}
                  />
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Department</label>
                  <ClassificationDropdown
                    options={departments.map(d => ({ value: d.id, label: d.name }))}
                    value={formData.department}
                    onChange={(val) => handleInputChange('department', val)}
                    onCreateNew={(name) => handleInlineCreate('department', name)}
                    placeholder="Select Department…"
                    creating={creatingType === 'department'}
                  />
                </div>

                {/* Sub-Department — depends on Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Sub-Department</label>
                  <ClassificationDropdown
                    options={subDepartments.map(sd => ({ value: sd.id, label: sd.name }))}
                    value={formData.subDepartment}
                    onChange={(val) => handleInputChange('subDepartment', val)}
                    onCreateNew={formData.department ? (name) => handleInlineCreate('subdepartment', name) : undefined}
                    placeholder={formData.department ? 'Select Sub-Department…' : 'Select a Department first'}
                    disabled={!formData.department}
                    creating={creatingType === 'subdepartment'}
                    noCreateMsg={formData.department ? 'No sub-departments found' : 'Select a Department first'}
                  />
                </div>

                {/* Category — local session values, no backend entity */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Category</label>
                  <ClassificationDropdown
                    options={categoriesLocal.map(c => ({ value: c, label: c }))}
                    value={formData.category}
                    onChange={(val) => handleInputChange('category', val)}
                    onCreateNew={(name) => handleInlineCreate('category', name)}
                    placeholder="Select Category…"
                    creating={creatingType === 'category'}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Tags</label>
                  <input value={formData.tags} onChange={(e) => handleInputChange('tags', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="e.g. Summer, Sale, New" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-72 flex flex-col">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><ImageIcon className="h-5 w-5 text-slate-400" /> Product Images</h3>
                <div onClick={() => fileInputRef.current.click()} className="flex-1 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer overflow-hidden relative">
                  <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.jpeg,.png,.svg,.webp" onChange={handleImageUpload} />
                  {formData.image ? (
                    <div className="relative w-full h-full group">
                      <img src={formData.image} alt="Product" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                        <p className="text-white text-sm font-medium flex items-center gap-2"><SquarePen className="h-4 w-4" /> Click to change</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-4">
                      <div className="bg-slate-100 p-3 rounded-full mb-3">
                        <Upload className="h-6 w-6 text-slate-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-600">Drag & Drop or Click to Upload</span>
                      <span className="text-xs mt-1 text-slate-400">JPG, PNG, SVG (Max 5MB)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="grid grid-cols-12 gap-6 animate-in fade-in duration-300">
            <div className="col-span-12 lg:col-span-8 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Calculator className="h-5 w-5 text-slate-400" /> Costing</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Cost (<CurrencySymbol />) <span className="text-red-500">*</span></label>
                    <input type="number" value={formData.cost} onChange={(e) => handleInputChange('cost', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50 font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Landing Cost</label>
                    <input type="number" readOnly className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm outline-none text-slate-500" value={formData.cost} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Net Landed Cost (NLC)</label>
                    <input type="number" readOnly className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm outline-none text-slate-500" value={formData.cost} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Costing Method</label>
                    <select value={formData.costMethod} onChange={(e) => handleInputChange('costMethod', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50">
                      <option value="FIFO">FIFO (First In First Out)</option>
                      <option value="LIFO">LIFO (Last In First Out)</option>
                      <option value="WEIGHTED_AVERAGE">Weighted Average</option>
                      <option value="LAST_PURCHASE_COST">Last Purchase Cost</option>

                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                    <input type="checkbox" checked={formData.isCostInclusive} onChange={(e) => handleInputChange('isCostInclusive', e.target.checked)} className="rounded text-[#F5C742] focus:ring-[#F5C742]" />
                    Cost Inclusive of Tax
                  </label>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Tag className="h-5 w-5 text-slate-400" /> Selling Prices</h3>
                <div className="bg-white border border-[#F5C742]/30 rounded-lg p-4 mb-6 flex flex-col md:flex-row items-end gap-4 shadow-[0_4px_12px_rgba(245,199,66,0.05)]">
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-xs font-semibold text-amber-600 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Markup %</label>
                    <input type="number" value={formData.markup} onChange={(e) => handleInputChange('markup', e.target.value)} className="w-full border border-amber-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400/50 outline-none" />
                  </div>
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-xs font-semibold text-amber-600 flex items-center gap-1"><Sparkles className="h-3 w-3" /> GP %</label>
                    <input type="number" readOnly value={formData.gp} className="w-full bg-slate-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-slate-600" />
                  </div>
                  <div className="flex-[2] w-full text-xs text-amber-700 pb-3 flex items-center gap-1 opacity-80">
                    <Info className="h-4 w-4" /> Tip: Adjusting Markup automatically updates Retail Price.
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Retail Price (<CurrencySymbol />) <span className="text-red-500">*</span></label>
                    <input type="number" value={formData.retailPrice} onChange={(e) => handleInputChange('retailPrice', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#F5C742]/50 text-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Wholesale Price (<CurrencySymbol />)</label>
                    <input type="number" value={formData.wholesalePrice} onChange={(e) => handleInputChange('wholesalePrice', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Minimum Sale Price</label>
                    <input type="number" value={formData.minPrice} onChange={(e) => handleInputChange('minPrice', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Maximum Sale Price</label>
                    <input type="number" value={formData.maxPrice} onChange={(e) => handleInputChange('maxPrice', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                  </div>
                </div>
                <div className="w-full md:w-1/2 md:pr-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Online Price</label>
                    <input type="number" value={formData.onlinePrice} onChange={(e) => handleInputChange('onlinePrice', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Globe className="h-5 w-5 text-slate-400" /> Tax Setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Purchase Tax %</label>
                    <input type="number" value={formData.purchaseTax} onChange={(e) => handleInputChange('purchaseTax', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Sales Tax %</label>
                    <input type="number" value={formData.salesTax} onChange={(e) => handleInputChange('salesTax', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Tax Category</label>
                    <select value={formData.taxCategory} onChange={(e) => handleInputChange('taxCategory', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"><option>Standard</option><option>Zero Rated</option><option>Exempt</option></select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">HSN / VAT Code (Compliance)</label>
                  <input value={formData.hsnCode} onChange={(e) => handleInputChange('hsnCode', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="e.g. 8517.12.00" />
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4">
              <div className="bg-[#FFFDF7] p-6 rounded-xl border border-slate-200 shadow-sm sticky top-24">
                <h3 className="font-semibold text-lg mb-6 flex items-center gap-2"><Calculator className="h-5 w-5 text-slate-400" /> Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                    <span className="text-sm text-slate-500">Markup %</span>
                    <span className="font-mono font-semibold">{formData.markup}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                    <span className="text-sm text-slate-500">GP %</span>
                    <span className={`font-mono font-semibold ${formData.gp < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formData.gp}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                    <span className="text-sm text-slate-500">Price Incl. Tax</span>
                    <CurrencyAmount value={formData.retailPrice * (1 + formData.salesTax / 100)} className="font-mono font-semibold" />
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                    <span className="text-sm text-slate-500">Price Excl. Tax</span>
                    <CurrencyAmount value={formData.retailPrice} className="font-mono font-semibold" />
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg text-center">
                      <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Profit per Unit</span>
                      <CurrencyAmount value={calculateProfit()} className="text-3xl font-bold text-emerald-700 mt-2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="grid grid-cols-12 gap-6 animate-in fade-in duration-300">
            <div className="col-span-12 lg:col-span-6 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Layers className="h-5 w-5 text-slate-400" /> Stock Controls</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Default Unit <span className="text-red-500">*</span></label>
                    <ClassificationDropdown
                      options={units.map(u => ({ value: u.id, label: `${u.name} (${u.abbreviation || u.name})` }))}
                      value={formData.defaultUnit}
                      onChange={(val) => handleInputChange('defaultUnit', val)}
                      onCreateNew={(name) => handleInlineCreate('defaultUnit', name)}
                      placeholder="Select Default Unit…"
                      creating={creatingType === 'defaultUnit'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Reorder Level</label>
                      <input type="number" value={formData.reorderLevel} onChange={(e) => handleInputChange('reorderLevel', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Reorder Unit</label>
                      <ClassificationDropdown
                        options={units.map(u => ({ value: u.id, label: `${u.name} (${u.abbreviation || u.name})` }))}
                        value={formData.reorderUnit}
                        onChange={(val) => handleInputChange('reorderUnit', val)}
                        onCreateNew={(name) => handleInlineCreate('reorderUnit', name)}
                        placeholder="Select Reorder Unit…"
                        creating={creatingType === 'reorderUnit'}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Reorder Qty</label>
                    <input type="number" value={formData.reorderQty} onChange={(e) => handleInputChange('reorderQty', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                    <p className="text-[10px] text-slate-400">Auto LPO will generate purchase order for this quantity.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Safety Stock</label>
                      <input type="number" value={formData.safetyStock} onChange={(e) => handleInputChange('safetyStock', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Min Stock</label>
                      <input type="number" value={formData.minStock} onChange={(e) => handleInputChange('minStock', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Max Stock</label>
                    <input type="number" value={formData.maxStock} onChange={(e) => handleInputChange('maxStock', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" placeholder="0" />
                  </div>
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                      <input type="checkbox" checked={formData.allowNegative} onChange={(e) => handleInputChange('allowNegative', e.target.checked)} className="rounded text-[#F5C742] focus:ring-[#F5C742]" />
                      Allow Negative Stock (Role Based)
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-6 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-slate-400" /> Procurement Settings</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Default Vendor</label>
                    <select value={formData.defaultVendor} onChange={(e) => handleInputChange('defaultVendor', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50">
                      <option value="">Select Vendor</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Procurement Type</label>
                    <select value={formData.procurementType} onChange={(e) => handleInputChange('procurementType', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50"><option>Normal Purchase</option><option>Consignment</option></select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Warehouse</label>
                    <select value={formData.warehouse} onChange={(e) => handleInputChange('warehouse', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50">
                      <option value="">Select Warehouse</option>
                      {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Zone</label>
                      <select value={formData.zone} onChange={(e) => handleInputChange('zone', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" disabled={!formData.warehouse}>
                        <option value="">Select Zone</option>
                        {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Locator</label>
                      <select value={formData.locator} onChange={(e) => handleInputChange('locator', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" disabled={!formData.zone}>
                        <option value="">Select Locator</option>
                        {locators.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500">Bin</label>
                      <select value={formData.bin} onChange={(e) => handleInputChange('bin', e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" disabled={!formData.locator}>
                        <option value="">Select Bin</option>
                        {bins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                    <RefreshCw className="h-5 w-5 text-blue-500 mt-1" />
                    <div className="text-sm text-blue-700">
                      <span className="font-semibold">Auto Generate LPO</span>
                      <p className="text-xs mt-1">System will automatically create purchase orders for {formData.reorderQty || 0} units when stock reaches {formData.reorderLevel || 0}.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Box className="h-5 w-5 text-slate-400" /> Packing Levels</h3>
              <button onClick={handleAddPacking} className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-medium rounded-md shadow-sm transition-colors">
                <Plus className="h-4 w-4" /> Add Packing Level
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
              <table className="bb-nowrap-table w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-3">Level</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 w-24">Ratio</th>
                    <th className="p-3">Base Qty</th>
                    <th className="p-3 text-center">Sale</th>
                    <th className="p-3 text-center">Buy</th>
                    <th className="p-3">Cost</th>
                    <th className="p-3">Retail</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.packings.map((pkg, idx) => (
                    <tr key={pkg.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3"><span className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">{pkg.level}</span></td>
                      <td className="p-3 font-medium">
                        <ClassificationDropdown
                          options={units.map(u => ({ value: u.id, label: u.name }))}
                          value={pkg.unit}
                          onChange={(selectedUnitId) => {
                            const selectedUnit = units.find(u => u.id == selectedUnitId);

                            // Auto-fill conversion ratio based on unit name
                            let autoConversion = 1; // Default to 1 for any other unit
                            if (selectedUnit) {
                              const unitName = selectedUnit.name.toLowerCase();
                              if (unitName.includes('piece') || unitName.includes('pcs') || unitName.includes('pc')) {
                                autoConversion = 1;
                              } else if (unitName.includes('outer')) {
                                autoConversion = 6;
                              } else if (unitName.includes('box')) {
                                autoConversion = 12;
                              } else if (unitName.includes('carton') || unitName.includes('ctn')) {
                                autoConversion = 48;
                              }
                            }

                            const updatedPackings = formData.packings.map(p => {
                              if (p.id !== pkg.id) return p;
                              const basePrice = parseFloat(formData.retailPrice || 0);
                              const baseCost = parseFloat(formData.cost || 0);
                              return {
                                ...p,
                                unit: selectedUnitId,
                                conversion: autoConversion,
                                baseQty: autoConversion,
                                cost: parseFloat((baseCost * autoConversion).toFixed(4)),
                                price: parseFloat((basePrice * autoConversion).toFixed(4))
                              };
                            });
                            setFormData(prev => ({ ...prev, packings: updatedPackings }));
                          }}
                          onCreateNew={(name) => handleInlineCreate(`packingUnit-${pkg.id}`, name)}
                          placeholder="Select Unit…"
                          creating={creatingType === `packingUnit-${pkg.id}`}
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={pkg.conversion}
                          onChange={(e) => {
                            const ratio = parseFloat(e.target.value) || 1;
                            // BB-007: Auto-compute baseQty, price, and cost from conversion ratio
                            const primaryPrice = parseFloat(formData.retailPrice || 0);
                            const primaryCost = parseFloat(formData.cost || 0);
                            const updatedPackings = formData.packings.map(p => {
                              if (p.id !== pkg.id) return p;
                              return {
                                ...p,
                                conversion: ratio,
                                baseQty: ratio,
                                price: idx === 0 ? primaryPrice : parseFloat((primaryPrice * ratio).toFixed(4)),
                                cost: idx === 0 ? primaryCost : parseFloat((primaryCost * ratio).toFixed(4))
                              };
                            });
                            setFormData(prev => ({ ...prev, packings: updatedPackings }));
                          }}
                          className="w-20 border border-slate-200 rounded px-2 py-1 outline-none focus:border-[#F5C742]"
                        />
                      </td>
                      <td className="p-3 font-mono">{pkg.baseQty}</td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!pkg.isSale}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              packings: prev.packings.map(p => p.id === pkg.id ? { ...p, isSale: checked } : p)
                            }));
                          }}
                          className="accent-[#F5C742]"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!pkg.isPurchase}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              packings: prev.packings.map(p => p.id === pkg.id ? { ...p, isPurchase: checked } : p)
                            }));
                          }}
                          className="accent-[#F5C742]"
                        />
                      </td>
                      <td className="p-3">
                        {idx === 0 ? (
                          <span className="text-slate-400 text-xs">{parseFloat(formData.cost || 0).toFixed(2)}</span>
                        ) : (
                          <input
                            type="number"
                            readOnly
                            value={pkg.cost ?? ''}
                            className="w-24 bg-slate-50 border border-slate-200 text-slate-500 rounded px-2 py-1 outline-none text-sm cursor-not-allowed"
                            placeholder="0.00"
                          />
                        )}
                      </td>
                      <td className="p-3">
                        {idx === 0 ? (
                          <span className="text-slate-400 text-xs">{parseFloat(formData.retailPrice || 0).toFixed(2)}</span>
                        ) : (
                          <input
                            type="number"
                            readOnly
                            value={pkg.price ?? ''}
                            className="w-24 bg-slate-50 border border-slate-200 text-slate-500 font-medium rounded px-2 py-1 outline-none text-sm cursor-not-allowed"
                            placeholder="0.00"
                          />
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {idx > 0 && (<button onClick={() => removePacking(pkg.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Multi-UOM Example Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-900 text-sm mb-2">Multi-UOM Example</h4>
                    <div className="space-y-1 text-xs text-blue-800">
                      <div className="leading-relaxed">
                        <div>• L1 - <span className="font-semibold">Piece</span>: Conversion 1:1 (Base) | Sale Unit ✓ | Barcode: 123456</div>
                        <div>• L2 - <span className="font-semibold">Outer</span>: Conversion 6:1 (6 pieces) | LPO Unit ✓ | Barcode: 234567</div>
                        <div>• L3 - <span className="font-semibold">Box</span>: Conversion 12:1 (12 pieces) | Purchase & LPO ✓ | Barcode: 345678</div>
                        <div>• L4 - <span className="font-semibold">Carton</span>: Conversion 48:1 (48 pieces) | Purchase Unit ✓ | Barcode: 456789</div>
                      </div>
                      <p className="text-blue-600 mt-2 text-xs">
                        <span className="font-semibold">Note:</span> Check Sale/Purchase/LPO boxes to enable the unit for specific transaction types.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Barcode className="h-5 w-5 text-slate-400" /> Barcode Setup</h3>
                  <p className="text-sm text-slate-500">Assign barcodes for each packing unit. Format: {isAutoBarcode ? "Auto-generated from Brand settings" : "ERP format (auto when empty)"}</p>
                </div>
                <button onClick={handleGenerateBarcodes} className="flex items-center gap-2 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-sm font-medium rounded-md shadow-sm transition-colors">
                  {isAutoBarcode ? <Barcode className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                  {isAutoBarcode ? "Auto-Generate Barcodes" : "Generate Barcodes"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
                <table className="bb-nowrap-table w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-3 w-1/4">Unit Level</th>
                      <th className="p-3 w-1/3">Barcode Value</th>
                      <th className="p-3">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.packings.map((pkg) => (
                      <tr key={pkg.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{pkg.level}</span>
                            <span className="font-medium">{units.find(u => u.id == pkg.unit)?.name || 'Select Unit'}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <input
                              value={pkg.barcode || ''}
                              readOnly={!allowManual}
                              onChange={(e) => handleBarcodeChange(pkg.id, e.target.value)}
                              className={`flex-1 border rounded px-3 py-2 font-mono text-sm ${!allowManual ? 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-900 border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none'}`}
                              placeholder={!allowManual ? "Click Generate..." : "Enter Barcode Manually..."}
                            />
                            <button
                              type="button"
                              onClick={() => handleGenerateBarcodeForPacking(pkg.id)}
                              title="Generate random barcode"
                              className="inline-flex items-center justify-center h-9 w-9 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="p-3">
                          {pkg.barcode ? (
                            <BarcodeRenderer value={pkg.barcode} />
                          ) : <span className="text-xs text-slate-400 italic">No Barcode</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Printer className="h-4 w-4 text-slate-400" /> Printing Actions</h4>
                <p className="text-xs text-slate-500">Save the product first to enable printing.</p>
              </div>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Building2 className="h-5 w-5 text-slate-400" /> Branch-wise Cost & Price Status</h3>
                  <p className="text-sm text-slate-500">Set selling prices per branch. The active branch selector will use that branch's retail/min/max prices in sales screens.</p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                  {formData.branchPrices?.length || 0} branch{(formData.branchPrices?.length || 0) === 1 ? '' : 'es'}
                </span>
              </div>

              {(!branches || branches.length === 0) ? (
                <div className="py-14 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                  <Building2 className="h-9 w-9 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-600">No branches available</p>
                  <p className="text-xs mt-1">Create branches first, then return here to set branch pricing.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="bb-nowrap-table w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                      <tr>
                        <th className="p-3 min-w-[180px]">Branch</th>
                        <th className="p-3 min-w-[120px]">Cost</th>
                        <th className="p-3 min-w-[120px]">Markup %</th>
                        <th className="p-3 min-w-[110px]">GP %</th>
                        <th className="p-3 min-w-[130px]">Retail Price</th>
                        <th className="p-3 min-w-[130px]">Min Sale Price</th>
                        <th className="p-3 min-w-[130px]">Max Sale Price</th>
                        <th className="p-3 min-w-[130px]">Wholesale Price</th>
                        <th className="p-3 min-w-[130px]">Online Price</th>
                        <th className="p-3 min-w-[110px]">Status</th>
                        <th className="p-3 min-w-[110px] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.branchPrices || []).map(row => (
                        <tr key={row.branchId} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{row.branchName}</div>
                            {row.branchCode && <div className="text-[11px] text-slate-400 font-mono">{row.branchCode}</div>}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.cost ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'cost', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <input type="number" step="0.01" value={row.markup ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'markup', e.target.value)} className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                              <span className="text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <input type="number" step="0.01" value={row.gp ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'gp', e.target.value)} className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                              <span className="text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.retailPrice ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'retailPrice', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.minPrice ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'minPrice', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.maxPrice ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'maxPrice', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.wholesalePrice ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'wholesalePrice', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <CurrencySymbol />
                              <input type="number" step="0.01" value={row.onlinePrice ?? ''} onChange={(e) => handleBranchPriceChange(row.branchId, 'onlinePrice', e.target.value)} className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
                            </div>
                          </td>
                          <td className="p-3">
                            <select value={row.status || 'ACTIVE'} onChange={(e) => handleBranchPriceChange(row.branchId, 'status', e.target.value)} className={`border rounded-md px-2 py-1.5 text-xs font-bold outline-none ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              <option value="ACTIVE">Active</option>
                              <option value="DRAFT">Draft</option>
                            </select>
                          </td>
                          <td className="p-3 text-right">
                            <button type="button" onClick={() => overrideBranchPrice(row.branchId)} className="px-3 py-1.5 rounded-md border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 text-xs font-semibold transition-colors">
                              Override
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 font-semibold text-blue-900"><DollarSign className="h-4 w-4" /> Markup %</div>
                  <p className="text-xs text-blue-800 mt-2">Percentage added to cost. Formula: Cost x (1 + Markup%).</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 font-semibold text-emerald-900"><TrendingUp className="h-4 w-4" /> GP %</div>
                  <p className="text-xs text-emerald-800 mt-2">Profit as a percentage of selling price. Formula: (Price - Cost) / Price x 100.</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 font-semibold text-amber-900"><AlertCircle className="h-4 w-4" /> Price Range Control</div>
                  <p className="text-xs text-amber-800 mt-2">Min/max prices are returned to sales screens with the current branch price.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <button onClick={onCancel} className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-slate-700">Cancel</button>
          <div className="flex gap-3">
            <button onClick={handleSaveDraft} className="flex items-center gap-2 px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-slate-600">
              <FileText className="h-4 w-4" /> Save as Draft
            </button>
            {currentStep < STEPS.length ? (
              <button onClick={handleNext} disabled={!isStepValid()} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors ${isStepValid() ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                Next Step <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={handleSaveActive} className="flex items-center gap-2 px-6 py-2.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg text-sm font-bold shadow-sm transition-colors transform active:scale-95">
                <Save className="h-4 w-4" /> Save Product
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const BarcodeRenderer = ({ value }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (value && canvasRef.current) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: "CODE128",
          displayValue: false,
          height: 30,
          width: 1,
          margin: 0
        });
      } catch (e) { console.error(e); }
    }
  }, [value]);
  return <canvas ref={canvasRef} />;
};

const PrintModal = ({ product, config, setConfig, onClose }) => {
  const canvasRef = useRef(null);

  const barcodeValue = product.packings && product.packings.length > 0 && product.packings[0].barcode
    ? product.packings[0].barcode
    : (product.barcode || null);

  useEffect(() => {
    if (barcodeValue && canvasRef.current) {
      try {
        JsBarcode(canvasRef.current, barcodeValue, {
          format: config.type === "code128" ? "CODE128" : "CODE39",
          lineColor: "#000",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          fontOptions: "bold",
          margin: 10
        });
      } catch (e) {
        console.error("Barcode error", e);
      }
    }
  }, [product, config, barcodeValue]);

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const printWindow = window.open('', '', 'height=600,width=800');
    const imgData = canvasRef.current.toDataURL("image/png");
    printWindow.document.write('<html><head><title>Print Barcode</title></head><body style="display: flex; justify-content: center; flex-wrap: wrap; gap: 15px;">');
    for (let i = 0; i < config.copies; i++) {
      printWindow.document.write(`<div style="text-align:center"><img src="${imgData}" style="max-width:100%"/></div>`);
    }
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white z-50 w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-6 space-y-6 animate-in zoom-in-95">
        <div className="flex justify-between items-center border-b pb-4">
          <h3 className="text-lg font-bold">Print Preview</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="flex justify-center border p-4 rounded-xl bg-slate-50">
          {barcodeValue ? <canvas ref={canvasRef}></canvas> : <p className="text-red-500 font-medium">No Barcode Found</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Format</label>
            <select className="w-full border rounded-lg h-10 px-2" value={config.type} onChange={e => setConfig({ ...config, type: e.target.value })}>
              <option value="code128">Code 128</option>
              <option value="code39">Code 39</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Copies</label>
            <input type="number" className="w-full border rounded-lg h-10 px-2" value={config.copies} onChange={e => setConfig({ ...config, copies: parseInt(e.target.value) || 1 })} />
          </div>
        </div>
        <button onClick={handlePrint} disabled={!barcodeValue} className={`w-full font-bold h-12 rounded-xl flex items-center justify-center gap-2 ${!barcodeValue ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white'}`}>
          <Printer className="h-5 w-5" /> Print Now
        </button>
      </div>
    </div>
  );
};

const ScannedDetailsModal = ({ product, onClose, onPrint }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white z-50 w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#F5C742] px-8 pt-8 pb-10 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-amber-900 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <Check className="h-3.5 w-3.5 text-green-600" /> Successfully Scanned
              </div>
              <button onClick={onClose} className="bg-white/20 p-2 rounded-full hover:bg-white/40 text-slate-900 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 leading-tight mb-1">{product.name}</h2>
            <p className="font-mono text-amber-900/70 text-sm font-medium">CODE: {product.code}</p>
          </div>
          <ScanLine className="absolute -right-6 -bottom-8 h-48 w-48 text-slate-900/5 rotate-12" />
        </div>

        {/* Body */}
        <div className="px-8 py-6 -mt-6 bg-white rounded-t-3xl relative z-20 flex-1 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-100 text-center">
              <DollarSign className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Retail Price</p>
              <CurrencyAmount value={product.retailPrice} className="font-bold text-emerald-700 text-lg" />
            </div>
            <div className="p-3 rounded-xl border bg-white border-slate-100 text-center">
              <Package className="h-4 w-4 text-purple-600 mx-auto mb-1" />
              <p className="text-[10px] font-bold text-slate-400 uppercase">Stock</p>
              <p className="font-bold text-slate-800 text-base">{product.quantity || 'N/A'}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-4">
            <div className="h-16 w-16 bg-white rounded border flex items-center justify-center">
              {product.image ? <img src={product.image} className="h-full w-full object-contain" /> : <Package className="text-slate-300" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{product.name}</p>
              <p className="text-xs text-slate-500">{product.brandName} • {product.departmentName}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4">
          <button onClick={onPrint} className="flex-1 bg-slate-900 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
            <Printer className="h-5 w-5" /> Print Label
          </button>
        </div>
      </div>
    </div>
  );
};

const ViewProductModal = ({ product, onClose }) => {
  if (!product) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white z-50 w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b p-6 bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Product Details</h2>
            <p className="text-sm text-slate-500">ID: {product.code}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="h-32 w-32 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
              {product.image ? <img src={product.image} className="h-full w-full object-contain p-2" /> : <Package className="h-10 w-10 text-slate-300" />}
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-2xl font-bold text-slate-900">{product.name}</h3>
              <p className="text-sm text-slate-500 font-mono bg-slate-100 inline-block px-2 py-1 rounded">{product.sku || 'No SKU'}</p>
              <div className="flex gap-2 mt-2">
                <span className={`px-2 py-1 text-xs rounded-full font-bold border ${product.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{product.status}</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-bold border border-blue-200">{product.departmentName || 'General'}</span>
              </div>
            </div>
            <div className="text-right space-y-1">
              <span className="block text-xs text-slate-500 uppercase">Retail Price</span>
              <CurrencyAmount value={product.retailPrice || 0} className="block text-2xl font-bold text-slate-900" />
              <span className="block text-xs text-slate-400">Cost: <CurrencyAmount value={product.cost || 0} /></span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block mb-1">Brand</span>
              <span className="font-semibold text-slate-900">{product.brandName || '-'}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block mb-1">Category</span>
              <span className="font-semibold text-slate-900">{product.category || '-'}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block mb-1">Stock Status</span>
              <span className="font-semibold text-slate-900">Manageable</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs text-slate-500 block mb-1">Profit Margin</span>
              <span className="font-semibold text-emerald-600">{product.gp}%</span>
            </div>
          </div>
        </div>
        <div className="border-t p-4 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-100 transition-colors">Close</button>
          <button onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">Print Details</button>
        </div>
      </div>
    </div>
  )
}

const ViewBarcodesModal = ({ product, units, onClose }) => {
  const navigate = useNavigate();

  if (!product) return null;

  const handlePrint = (barcode, product) => {
    navigate('/inventory/barcode', {
      state: {
        printQueue: [{
          product: product,
          barcode: barcode,
          qty: 1
        }]
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white z-50 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b p-4 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Product Barcodes</h2>
            <p className="text-sm text-slate-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 transition-colors"><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="p-0 overflow-y-auto max-h-[60vh]">
          <table className="bb-nowrap-table w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
              <tr>
                <th className="p-3">Unit</th>
                <th className="p-3">Barcode</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {product.packings && product.packings.map((pkg, idx) => {
                const unitName = pkg.unit?.name || units.find(u => u.id === (pkg.unit?.id ?? pkg.unit))?.name || 'Unknown Unit';
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">
                      <div className="flex flex-col">
                        <span>{unitName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Level {pkg.level}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{pkg.barcode || '-'}</td>
                    <td className="p-3 text-right">
                      {pkg.barcode && (
                        <button
                          onClick={() => handlePrint(pkg.barcode, product)}
                          className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                        >
                          <Printer className="h-3 w-3" /> Print
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!product.packings || product.packings.length === 0) && (
                <tr>
                  <td colSpan="3" className="p-4 text-center text-slate-500 italic">No packings configured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// IMPORT PROGRESS MODAL
// ==========================================
const formatImportDuration = (ms) => {
  if (ms == null || !Number.isFinite(Number(ms))) return 'calculating...';
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const ImportProgressModal = ({ fileName, status, message, progress = {}, onClose }) => {
  if (!fileName) return null;
  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const percent = Math.max(0, Math.min(100, Number(progress.percent ?? 0)));
  const processedRows = Number(progress.processedRows || 0);
  const totalRows = Number(progress.totalRows || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center gap-3 ${isLoading ? 'bg-[#F5C742]/10 border-b border-[#F5C742]/30' :
          isSuccess ? 'bg-emerald-50 border-b border-emerald-200' :
            'bg-red-50 border-b border-red-200'
          }`}>
          {isLoading ? (
            <div className="h-9 w-9 rounded-full bg-[#F5C742]/20 flex items-center justify-center">
              <RefreshCw className="h-5 w-5 text-[#F5C742] animate-spin" />
            </div>
          ) : isSuccess ? (
            <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <CircleCheckBig className="h-5 w-5 text-emerald-600" />
            </div>
          ) : (
            <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center">
              <CircleX className="h-5 w-5 text-red-600" />
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-800 text-sm">
              {isLoading ? 'Importing...' : isSuccess ? 'Import Complete' : 'Import Failed'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[320px]" title={fileName}>
              📄 {fileName}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative h-20 w-20">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                <div className="absolute inset-0 rounded-full border-4 border-[#F5C742] border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-800">{percent}%</span>
                </div>
              </div>
              <div className="text-center w-full">
                <p className="text-sm font-medium text-slate-700">Adding products to database</p>
                <p className="text-xs text-slate-400 mt-1">
                  {processedRows.toLocaleString()} of {totalRows.toLocaleString()} rows processed
                </p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-[#F5C742] rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 w-full text-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-400">Created</div>
                  <div className="mt-1 font-bold text-slate-800">{Number(progress.createdCount || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-400">Duplicate Codes Added</div>
                  <div className="mt-1 font-bold text-slate-800">{Number(progress.duplicateCreatedCount || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-400">Updated</div>
                  <div className="mt-1 font-bold text-slate-800">{Number(progress.updatedCount || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-400">Skipped</div>
                  <div className="mt-1 font-bold text-slate-800">{Number(progress.skippedCount || 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex w-full items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Elapsed {formatImportDuration(progress.elapsedMs)}
                </span>
                <span>Remaining {formatImportDuration(progress.estimatedRemainingMs)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs leading-relaxed">
              {message}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="px-6 pb-5">
            <button
              onClick={onClose}
              className={`w-full h-9 rounded-lg text-sm font-medium transition-colors ${isSuccess
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
            >
              {isSuccess ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


const Products = () => {
  const navigate = useNavigate();
  const { hasAnyRole } = usePermissions();
  const { activeBranchId } = useBranch();
  const isAdmin = hasAnyRole('ADMIN');
  const [currentView, setCurrentView] = useState('list');
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [branches, setBranches] = useState([]);

  const [editingProduct, setEditingProduct] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [productToPrint, setProductToPrint] = useState(null);
  const [printConfig, setPrintConfig] = useState({ copies: 1, type: "code128" });
  const [viewBarcodesProduct, setViewBarcodesProduct] = useState(null);

  const [importModal, setImportModal] = useState({ fileName: null, status: 'loading', message: '', progress: null });
  const closeImportModal = () => setImportModal(m => ({ ...m, fileName: null }));

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [filterDepartment, setFilterDepartment] = useState("All Departments");
  const [filterBrand, setFilterBrand] = useState("All Brands");
  const [sortBy, setSortBy] = useState("Sort by Name");
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusCounts, setStatusCounts] = useState({ active: null, draft: null });

  // Pagination state
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Debounce: wait 400ms after user stops typing, then search backend
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // When debouncedSearch changes, go back to page 0 and re-fetch
  useEffect(() => {
    setCurrentPage(0);
    fetchProducts(0, debouncedSearch);
  }, [debouncedSearch]);

  // When page changes (and search hasn't changed), re-fetch
  useEffect(() => {
    fetchProducts(currentPage, debouncedSearch);
    fetchMasters();
  }, [currentPage]);

  // BB-001: When department or brand filter changes, reset to page 0 and re-fetch server-side
  useEffect(() => {
    setCurrentPage(0);
    fetchProducts(0, debouncedSearch);
  }, [filterDepartment, filterBrand, activeBranchId]);

  const fetchMasters = async () => {
    try {
      const [brandRes, deptRes, unitRes, whRes, vendorRes, branchRes] = await Promise.all([
        getBrands(),
        getDepartments(),
        getUnits(),
        getWarehouses(),
        getVendors(),
        getBranches()
      ]);
      setBrands(brandRes);
      setDepartments(deptRes);
      setUnits(unitRes);
      setWarehouses(whRes);
      setVendors(vendorRes);
      setBranches(Array.isArray(branchRes) ? branchRes : []);
    } catch (err) {
      console.error("Failed to load master data", err);
    }
  };

  const getProductListFilterIds = () => ({
    deptId: filterDepartment !== "All Departments"
      ? departments.find(d => d.name === filterDepartment)?.id || null
      : null,
    brnId: filterBrand !== "All Brands"
      ? brands.find(b => b.name === filterBrand)?.id || null
      : null
  });

  const fetchProducts = async (page = 0, search = debouncedSearch) => {
    try {
      setLoading(true);
      // BB-001: Resolve department/brand IDs for server-side filtering
      const { deptId, brnId } = getProductListFilterIds();
      const data = await getProductsList(page, PAGE_SIZE, search, undefined, null, deptId, brnId);

      if (!data || !Array.isArray(data.content)) {
        console.error("API did not return expected list response:", data);
        setProducts([]);
        return;
      }

      const mapped = data.content.map(mapProductListItem);
      setProducts(mapped);
      setTotalPages(data.totalPages ?? 0);
      setTotalElements(data.totalElements ?? 0);
      const activeCount = data?.statusCounts?.ACTIVE;
      const draftCount = data?.statusCounts?.DRAFT;
      setStatusCounts({
        active: typeof activeCount === 'number' ? activeCount : null,
        draft: typeof draftCount === 'number' ? draftCount : null
      });
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  const loadProductsForExport = async () => {
    const { deptId, brnId } = getProductListFilterIds();
    const initialSize = Math.max(PAGE_SIZE, totalElements || PAGE_SIZE);
    let data = await getProductsList(0, initialSize, debouncedSearch, undefined, null, deptId, brnId);

    if (!data || !Array.isArray(data.content)) {
      throw new Error("Product list export API did not return a valid response.");
    }

    const exportTotal = data.totalElements ?? data.content.length;
    if (exportTotal > data.content.length) {
      data = await getProductsList(0, exportTotal, debouncedSearch, undefined, null, deptId, brnId);
      if (!data || !Array.isArray(data.content)) {
        throw new Error("Product list export API did not return a valid full response.");
      }
    }

    return sortProducts(data.content.map(mapProductListItem), sortBy);
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const exportRows = await loadProductsForExport();
      const exportRowsWithSNo = withListSerialNumbers(exportRows);
      await exportToExcel(exportRowsWithSNo, PRODUCT_COLUMNS, 'Products');
    } catch (err) {
      console.error("Failed to export products to Excel", err);
      alert(err.response?.data?.message || err.message || "Failed to export products.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const exportRows = await loadProductsForExport();
      const exportRowsWithSNo = withListSerialNumbers(exportRows);
      await exportToPDF(exportRowsWithSNo, PRODUCT_COLUMNS, 'Products List', 'Products');
    } catch (err) {
      console.error("Failed to export products to PDF", err);
      alert(err.response?.data?.message || err.message || "Failed to export products.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveProduct = async (formData) => {
    try {
      setLoading(true);
      const jsonPayload = buildProductPayload(formData);
      const dataToSend = new FormData();
      dataToSend.append("data", JSON.stringify(jsonPayload));

      if (formData.imageFile) {
        dataToSend.append("file", formData.imageFile);
      }

      if (editingProduct) {
        await updateProduct(formData.id, dataToSend);
      } else {
        await createProduct(dataToSend);
      }

      await fetchProducts(currentPage);
      setCurrentView("list");
      setEditingProduct(null);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(id);
      await fetchProducts(currentPage);
    } catch (err) {
      alert("Failed to delete product");
    }
  };



  const fileInputRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportModal({
      fileName: file.name,
      status: 'loading',
      message: '',
      progress: { percent: 0, processedRows: 0, totalRows: 0 }
    });
    try {
      const started = await startProductImport(file);
      let latest = started;
      setImportModal(m => ({ ...m, progress: latest }));

      while (latest?.status === 'QUEUED' || latest?.status === 'RUNNING') {
        await new Promise(resolve => setTimeout(resolve, 700));
        latest = await getProductImportProgress(started.jobId);
        setImportModal(m => ({ ...m, progress: latest }));
      }

      if (latest?.status === 'SUCCESS') {
        setImportModal({
          fileName: file.name,
          status: 'success',
          message: latest.message || 'Import completed successfully.',
          progress: latest
        });
      } else {
        setImportModal({
          fileName: file.name,
          status: 'error',
          message: latest?.message || 'Failed to import products.',
          progress: latest
        });
      }
      await fetchProducts();
    } catch (err) {
      console.error('Import failed', err);
      const errMsg = err.response?.data || err.message || 'Failed to import products.';
      setImportModal({ fileName: file.name, status: 'error', message: errMsg, progress: null });
    } finally {
      e.target.value = null;
    }
  };

  const handleEdit = async (productInfo) => {
    try {
      setLoading(true);
      const fullProductData = await getProductById(productInfo.id);

      const { product, pricing, tax, inventory, primaryImage, branchPrices } = fullProductData;
      const mappedBranchPrices = Array.isArray(branchPrices)
        ? branchPrices
          .filter(row => row?.branch?.id)
          .map(row => ({
            id: row.id || null,
            branchId: row.branch.id,
            branchName: row.branch.name || `Branch ${row.branch.id}`,
            branchCode: row.branch.code || '',
            cost: row.cost ?? '',
            markup: row.markup ?? 0,
            gp: row.gp ?? 0,
            retailPrice: row.retailPrice ?? '',
            minPrice: row.minPrice ?? '',
            maxPrice: row.maxPrice ?? '',
            wholesalePrice: row.wholesalePrice ?? '',
            onlinePrice: row.onlinePrice ?? '',
            status: row.status || 'ACTIVE',
            overridden: true
          }))
        : [];

      const mappedData = {
        ...INITIAL_FORM_STATE,
        id: product?.id,
        name: product?.name || '',
        code: product?.code || '',
        localName: product?.localName || '',
        sku: product?.sku || '',
        shortDesc: product?.shortDesc || '',
        detailedDesc: product?.detailedDesc || '',
        brand: product?.brand ? product.brand.id : '',
        department: product?.department ? product.department.id : '',
        subDepartment: product?.subDepartment ? product.subDepartment.id : '',
        category: product?.category || '',
        productType: product?.productType ? product.productType.toLowerCase() : 'stock',
        isSerial: product?.isSerial || false,
        batchControlled: !!product?.isBatch,
        expiryControlled: !!product?.expiryEnabled,
        fefoEnabled: product?.fefoEnabled != null ? !!product.fefoEnabled : true,
        minExpiryDaysForSale: product?.minExpiryDaysForSale || 0,
        isWeighing: product?.isWeighing || false,
        isDiscountAllowed: product?.isDiscountAllowed != null ? product.isDiscountAllowed : true,
        maxDiscount: product?.maxDiscount || 0,
        status: product?.status || 'Active',

        image: primaryImage ? getImageUrl(primaryImage) : null,

        cost: pricing?.cost || '',
        landingCost: pricing?.landingCost || 0,
        nlc: pricing?.nlc || 0,
        costMethod: pricing?.costMethod || 'FIFO',
        isCostInclusive: pricing?.isCostInclusive || false,
        markup: pricing?.markup || 0,
        gp: pricing?.gp || 0,
        retailPrice: pricing?.retailPrice || '',
        wholesalePrice: pricing?.wholesalePrice || '',
        minPrice: pricing?.minPrice || '',
        maxPrice: pricing?.maxPrice || '',
        onlinePrice: pricing?.onlinePrice || '',

        // Use ?? not || here — a deliberate 0% (zero-rated item) must not
        // silently fall through to the 5% default on each save round-trip.
        purchaseTax: tax?.purchaseTax ?? 5,
        salesTax: tax?.salesTax ?? 5,
        taxCategory: tax?.taxCategory || 'Standard',
        hsnCode: tax?.hsnCode || '',

        defaultUnit: inventory?.defaultUnit ? inventory.defaultUnit.id : '',
        reorderLevel: inventory?.reorderLevel || 0,
        reorderUnit: inventory?.reorderUnit ? inventory.reorderUnit.id : '',
        reorderQty: inventory?.reorderQty || 0,
        safetyStock: inventory?.safetyStock || 0,
        minStock: inventory?.minStock || 0,
        maxStock: inventory?.maxStock || 0,
        allowNegative: inventory?.allowNegative || false,
        defaultVendor: inventory?.defaultVendor ? inventory.defaultVendor.id : '',
        procurementType: inventory?.procurementType || 'Normal Purchase',
        warehouse: inventory?.warehouse ? inventory.warehouse.id : '',
        zone: inventory?.zone ? inventory.zone.id : '',
        locator: inventory?.locator ? inventory.locator.id : '',
        bin: inventory?.bin ? inventory.bin.id : '',

        packings: inventory?.packings && inventory.packings.length > 0
          ? inventory.packings.map((p, index) => ({
            ...INITIAL_FORM_STATE.packings[0],
            ...p,
            id: p.id || Date.now() + index,
            unit: p.unit || '',
            conversion: p.conversion ?? 1,
            baseQty: p.baseQty ?? p.conversion ?? 1,
            cost: p.cost ?? 0,
            price: p.price ?? 0,
            barcode: p.barcode || ''
          }))
          : [{ ...INITIAL_FORM_STATE.packings[0] }],
        branchPrices: mappedBranchPrices
      };

      setEditingProduct(mappedData);
      setCurrentView('add');
    } catch (err) {
      console.error("Failed to fetch product details", err);
      alert("Failed to load product details for editing.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanInput = (e) => {
    if (e.key === "Enter") {
      const scannedValue = searchTerm.trim().toUpperCase();
      if (!scannedValue) return;

      const found = products.find(p => {
        if (p.code.toUpperCase() === scannedValue) return true;
        if (p.packings && p.packings.some(pkg => pkg.barcode === scannedValue)) return true;
        return false;
      });

      if (found) {
        setScannedProduct(found);
        setSearchTerm("");
      } else {
        alert("Product not found via scan.");
      }
    }
  };

  const openPrintModal = (product) => {
    // If multiple barcodes, open the view modal instead of direct print
    if (product.packings && product.packings.length > 1) {
      setViewBarcodesProduct(product);
    } else {
      // Direct print navigation for single barcode
      const barcode = product.packings?.[0]?.barcode || product.barcode;
      if (barcode) {
        navigate('/inventory/barcode', {
          state: {
            printQueue: [{
              product: product,
              barcode: barcode,
              qty: 1
            }]
          }
        });
      } else {
        alert("No barcode found for this product.");
      }
    }
  };

  // BB-001: Dept/brand filtering is now server-side. Client-side only does sort.
  const filteredData = products;

  const sortedData = sortProducts(filteredData, sortBy);

  // BB-001: Build departments list from the API-fetched departments state (not from current page products)
  const uniqueDepartmentsList = ["All Departments", ...departments.map(d => d.name).filter(Boolean).sort()];
  const uniqueBrandsList = ["All Brands", ...new Set(brands.map(b => b.name).filter(Boolean))].sort((a, b) => {
    if (a === "All Brands") return -1;
    if (b === "All Brands") return 1;
    return a.localeCompare(b);
  });

  if (currentView === 'add') {
    return (
      <AddProductWizard
        onCancel={() => { setCurrentView('list'); setEditingProduct(null); }}
        onSave={handleSaveProduct}
        initialData={editingProduct}
        brands={brands}
        departments={departments}
        units={units}
        warehouses={warehouses}
        vendors={vendors}
        branches={branches}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 md:p-6 space-y-6 font-sans text-slate-900 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Inventory & Registries</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-slate-900 font-medium">Products / Services</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-[#F5C742]" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Products / Services</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500">Complete product catalog with inventory, pricing, and multi-branch control</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentView('add')} className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium h-9 px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> Add New Product
          </button>

          {/* Hidden Import Input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx, .xls"
            onChange={handleImport}
          />

          <button
            onClick={() => fileInputRef.current.click()}
            disabled={importModal.status === 'loading' && !!importModal.fileName}
            className="inline-flex items-center justify-center text-sm font-medium border bg-white hover:bg-slate-100 h-9 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 transition-colors disabled:opacity-50"
          >
            {importModal.status === 'loading' && importModal.fileName ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="hidden sm:inline">{importModal.status === 'loading' && importModal.fileName ? 'Importing...' : 'Import'}</span>
          </button>

          <ExportDropdown
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            disabled={isExporting}
          />
        </div>
      </div>

      {/* Stats Cards - Updated as Requested */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Products"
          value={totalElements}
          icon={Package}
          iconColor="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Active Products"
          value={statusCounts.active ?? products.filter(p => p.status === "ACTIVE").length}
          trend="up"
          icon={CircleCheckBig}
          iconColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Draft Items"
          value={statusCounts.draft ?? products.filter(p => p.status === "DRAFT").length}
          trend="neutral"
          icon={AlertCircle}
          iconColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total Categories"
          value={uniqueDepartmentsList.length - 1}
          icon={Layers}
          iconColor="bg-blue-50 text-blue-600"
        />
      </div>

      <div className="flex flex-col gap-6 rounded-xl border bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 pb-0">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleScanInput}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 pl-9 text-sm focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400 outline-none"
                placeholder="Scan barcode or search..."
              />
            </div>
            <Dropdown options={uniqueDepartmentsList} selected={filterDepartment} onSelect={setFilterDepartment} />
            <Dropdown options={uniqueBrandsList} selected={filterBrand} onSelect={setFilterBrand} />
            <Dropdown options={["Sort by Name", "Sort by Code", "Sort by Brand"]} selected={sortBy} onSelect={setSortBy} />
          </div>
          <div className="mt-3 flex items-center justify-between pb-4">
            <p className="text-xs text-slate-500">
              Showing {((currentPage) * PAGE_SIZE) + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalElements)} of {totalElements} products
            </p>
            <button onClick={() => fetchProducts(currentPage)} className="inline-flex items-center justify-center text-sm font-medium border bg-white hover:bg-slate-50 h-8 rounded-md gap-1.5 px-3 border-slate-200 text-slate-700 transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="bb-nowrap-table w-full text-sm min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-center p-3 font-medium text-slate-600 w-16 select-none">S.No.</th>
                <th className="text-left p-3 font-medium text-slate-600">Product</th>
                <th className="text-left p-3 font-medium text-slate-600">Code</th>
                <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                <th className="text-left p-3 font-medium text-slate-600">Department</th>
                <th className="text-left p-3 font-medium text-slate-600">Cost</th>
                <th className="text-left p-3 font-medium text-slate-600">Retail Price</th>
                <th className="text-left p-3 font-medium text-slate-600">Status</th>
                <th className="text-left p-3 font-medium text-slate-600">Barcode</th>
                <th className="text-right p-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-3"><div className="h-3 w-6 bg-slate-200 rounded animate-pulse mx-auto" /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md bg-slate-200 animate-pulse flex-shrink-0" />
                        <div className="space-y-1.5">
                          <div className="h-3 w-36 bg-slate-200 rounded animate-pulse" />
                          <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><div className="h-3 w-20 bg-slate-200 rounded animate-pulse" /></td>
                    <td className="p-3"><div className="h-3 w-16 bg-slate-200 rounded animate-pulse" /></td>
                    <td className="p-3"><div className="h-3 w-24 bg-slate-200 rounded animate-pulse" /></td>
                    <td className="p-3"><div className="h-3 w-16 bg-slate-200 rounded animate-pulse" /></td>
                    <td className="p-3"><div className="h-3 w-16 bg-slate-200 rounded animate-pulse" /></td>
                    <td className="p-3"><div className="h-5 w-14 bg-slate-200 rounded-md animate-pulse" /></td>
                    <td className="p-3"><div className="h-5 w-20 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="h-8 w-8 rounded-md bg-slate-200 animate-pulse" />
                        <div className="h-8 w-8 rounded-md bg-slate-200 animate-pulse" />
                        <div className="h-8 w-8 rounded-md bg-slate-200 animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                <tr><td colSpan="10" className="p-12 text-center text-slate-500">No products found matching your criteria.</td></tr>
              ) : (
                sortedData.map((product, index) => {
                  const displayBarcode = product.packings && product.packings.length > 0
                    ? product.packings.find(p => p.barcode)?.barcode
                    : null;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50 border-b border-slate-100 transition-colors group">
                      <td className="p-3 text-center text-slate-400 font-mono font-medium">
                        {getListSerialNumber(index, {
                          page: currentPage,
                          size: PAGE_SIZE,
                          totalElements,
                        })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            {product.image ? <img src={product.image} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-slate-300" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900 line-clamp-1">{product.name}</span>
                            {product.localName && <span className="text-[10px] text-slate-400 line-clamp-1">{product.localName}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-mono bg-slate-50 border-slate-200 text-slate-600 min-h-[24px]">{product.code}</span>
                      </td>
                      <td className="p-3"><span className="text-xs font-mono text-slate-600">{product.sku}</span></td>
                      <td className="p-3"><span className="text-sm text-slate-700">{product.departmentName || 'General'}</span></td>
                      <td className="p-3"><CurrencyAmount value={product.cost || 0} className="text-sm font-medium text-slate-500" /></td>
                      <td className="p-3"><CurrencyAmount value={product.retailPrice || 0} className="text-sm font-bold text-slate-900" /></td>
                      <td className="p-3">
                        {product.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-emerald-600 border-slate-200">
                            <CircleCheckBig className="mr-1 h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium bg-slate-50 text-slate-500 border-slate-200">
                            <CircleX className="mr-1 h-3 w-3" /> Draft
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {displayBarcode ? (
                          product.packings && product.packings.length > 1 ? (
                            <button
                              onClick={() => setViewBarcodesProduct(product)}
                              className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                              <Barcode className="h-3 w-3" /> {product.packings.length} Barcodes
                            </button>
                          ) : (
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 border border-slate-200">
                              {displayBarcode}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {displayBarcode && (
                            <ActionButton onClick={() => openPrintModal(product)} icon={<Printer className="h-4 w-4" />} />
                          )}
                          <ActionButton onClick={() => setViewingProduct(product)} icon={<Eye className="h-4 w-4" />} />
                          <ActionButton onClick={() => handleEdit(product)} icon={<SquarePen className="h-4 w-4" />} />
                          <ActionButton onClick={() => handleDelete(product.id)} icon={<Trash2 className="h-4 w-4" />} color="text-red-600 hover:bg-red-50" />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Page {currentPage + 1} of {totalPages} &nbsp;·&nbsp; {totalElements} total products
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(0)}
                disabled={currentPage === 0 || loading}
                className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0 || loading}
                className="px-3 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>

              {/* Page number buttons — show up to 5 around current page */}
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 2)
                .reduce((acc, i, idx, arr) => {
                  if (idx > 0 && i - arr[idx - 1] > 1) acc.push('...');
                  acc.push(i);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 py-1 text-xs text-slate-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item)}
                      disabled={loading}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${currentPage === item
                        ? 'bg-[#F5C742] border-[#F5C742] text-slate-900 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                        } disabled:cursor-not-allowed`}
                    >
                      {item + 1}
                    </button>
                  )
                )
              }

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1 || loading}
                className="px-3 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages - 1)}
                disabled={currentPage >= totalPages - 1 || loading}
                className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import Progress Modal */}
      <ImportProgressModal
        fileName={importModal.fileName}
        status={importModal.status}
        message={importModal.message}
        progress={importModal.progress}
        onClose={closeImportModal}
      />

      <ViewProductModal product={viewingProduct} onClose={() => setViewingProduct(null)} />


      {
        scannedProduct && (
          <ScannedDetailsModal
            product={scannedProduct}
            onClose={() => setScannedProduct(null)}
            onPrint={() => {
              openPrintModal(scannedProduct);
              setScannedProduct(null);
            }}
          />
        )
      }

      {/* Barcode View Modal */}
      <ViewBarcodesModal
        product={viewBarcodesProduct}
        units={units}
        onClose={() => setViewBarcodesProduct(null)}
      />

      {/* Print Modal - Legacy single print */}
      {
        printModalOpen && (
          <PrintModal
            product={productToPrint}
            config={printConfig}
            setConfig={setPrintConfig}
            onClose={() => setPrintModalOpen(false)}
          />
        )
      }


    </div >
  );
};

const Dropdown = ({ options, selected, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 outline-none">
        <span className="truncate">{selected}</span>
        <ChevronDown className={`h-4 w-4 opacity-50 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-slate-200 bg-white shadow-lg py-1 max-h-60 overflow-y-auto">
          {options.map(opt => (
            <button key={opt} onClick={() => { onSelect(opt); setIsOpen(false); }} className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors ${selected === opt ? 'bg-[#F5C742] text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span>{opt}</span>
              {selected === opt && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
};

const StatCard = ({ label, value, subValue, trend, icon: Icon, iconColor }) => (
  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {/* Optional trend or subtext rendering if provided */}
    {(trend || subValue) && (
      <div className="mt-4 flex items-center text-xs">
        {trend === 'up' && <span className="text-emerald-600 flex items-center font-medium mr-2"><TrendingUp className="mr-1 h-3 w-3" /> +2.5%</span>}
        {trend === 'down' && <span className="text-red-600 flex items-center font-medium mr-2"><TrendingDown className="mr-1 h-3 w-3" /> -1.2%</span>}
        {subValue && <span className="text-slate-500">{subValue}</span>}
      </div>
    )}
  </div>
);

const ActionButton = ({ icon, color = "text-slate-900", onClick }) => (
  <button onClick={onClick} className={`inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 p-0 ${color}`}>
    {icon}
  </button>
);

export default Products;
