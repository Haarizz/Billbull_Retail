import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Building2, Save, Upload, X, Globe, Phone, Mail,
  MapPin, Hash, DollarSign, User, RefreshCw, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown';
import { getCompanyProfile, updateCompanyProfile, uploadCompanyLogo, uploadCompanyStamp } from '../../api/companyProfileApi';
import { useCompany } from '../../context/CompanyContext';
import { getImageUrl } from '../../utils/urlUtils';
import {
  getCountryOptions,
  getCurrencyOptions,
  normalizeCountryValue,
  normalizeCurrencyValue,
  withFallbackOption
} from '../../utils/countryCurrencyOptions';

// ==========================================
// COMPANY SETTINGS PAGE
// ==========================================

const EMPTY_FORM = {
  companyName: '',
  localName: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  mobile: '',
  email: '',
  trn: '',
  currency: '',
  currencySymbol: '',
  website: '',
  showStampInPrint: true,
  showStampInEmail: true,
};

const CompanySettings = () => {
  const { refreshCompany } = useCompany();
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoPath, setLogoPath] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [stampPath, setStampPath] = useState('');
  const [stampPreview, setStampPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingStamp, setIsUploadingStamp] = useState(false);
  const fileInputRef = useRef(null);
  const stampFileInputRef = useRef(null);
  const countryOptions = useMemo(() => withFallbackOption(
    getCountryOptions(),
    normalizeCountryValue(form.country)
  ), [form.country]);
  const currencyOptions = useMemo(() => withFallbackOption(
    getCurrencyOptions(),
    normalizeCurrencyValue(form.currency),
    (value) => ({ value, label: value, displayLabel: value })
  ), [form.currency]);

  // Load on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await getCompanyProfile();
        const p = res.data;
        setForm({
          companyName: p.companyName || '',
          localName: p.localName || '',
          address: p.address || '',
          city: p.city || '',
          country: normalizeCountryValue(p.country || ''),
          phone: p.phone || '',
          mobile: p.mobile || '',
          email: p.email || '',
          trn: p.trn || '',
          currency: normalizeCurrencyValue(p.currency || ''),
          currencySymbol: p.currencySymbol || '',
          website: p.website || '',
          showStampInPrint: p.showStampInPrint !== false,
          showStampInEmail: p.showStampInEmail !== false,
        });
        setLogoPath(p.logoPath || '');
        if (p.logoPath) setLogoPreview(getImageUrl(p.logoPath));
        setStampPath(p.stampPath || '');
        if (p.stampPath) setStampPreview(getImageUrl(p.stampPath));
      } catch (err) {
        console.error('Failed to load company profile', err);
        toast.error('Failed to load company profile');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);

    setIsUploadingLogo(true);
    try {
      const res = await uploadCompanyLogo(file);
      const newPath = res.data?.logoPath || res.data;
      setLogoPath(newPath);
      setLogoPreview(getImageUrl(newPath));
      toast.success('Logo uploaded');
    } catch (err) {
      console.error('Logo upload failed', err);
      toast.error('Logo upload failed');
      setLogoPreview(logoPath ? getImageUrl(logoPath) : null);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPath('');
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStampChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setStampPreview(ev.target.result);
    reader.readAsDataURL(file);

    setIsUploadingStamp(true);
    try {
      const res = await uploadCompanyStamp(file);
      const newPath = res.data?.stampPath || res.data;
      setStampPath(newPath);
      setStampPreview(getImageUrl(newPath));
      toast.success('Stamp uploaded');
    } catch (err) {
      console.error('Stamp upload failed', err);
      toast.error('Stamp upload failed');
      setStampPreview(stampPath ? getImageUrl(stampPath) : null);
    } finally {
      setIsUploadingStamp(false);
    }
  };

  const handleRemoveStamp = () => {
    setStampPath('');
    setStampPreview(null);
    if (stampFileInputRef.current) stampFileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    setIsSaving(true);
    try {
      await updateCompanyProfile({
        ...form,
        country: normalizeCountryValue(form.country),
        currency: normalizeCurrencyValue(form.currency),
        logoPath,
        stampPath,
      });
      await refreshCompany();
      toast.success('Company profile saved');
    } catch (err) {
      console.error('Failed to save company profile', err);
      toast.error('Failed to save company profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: '#64748b' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading company profile…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={20} color="#D97706" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Company Profile</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>This information appears on invoices, quotations, and printed documents.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* LEFT: Logo card */}
        <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 120, height: 120, borderRadius: 12,
              border: '2px dashed #e2e8f0',
              background: '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {logoPreview
                ? <img src={logoPreview} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Building2 size={40} color="#cbd5e1" />
              }
              {isUploadingLogo && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={24} color="#F5C742" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
            {logoPreview && (
              <button
                onClick={handleRemoveLogo}
                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={12} color="#fff" />
              </button>
            )}
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1e293b' }}>Company Logo</p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>PNG, JPG or SVG — max 2 MB. Shown on all print templates.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLogo}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: isUploadingLogo ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500, color: '#334155'
              }}
            >
              <Upload size={14} />
              {isUploadingLogo ? 'Uploading…' : 'Upload Logo'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
          </div>
        </div>

        {/* Stamp card */}
        <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 120, height: 120, borderRadius: 12,
              border: '2px dashed #e2e8f0',
              background: '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {stampPreview
                ? <img src={stampPreview} alt="Company Stamp" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.85 }} />
                : <Award size={40} color="#cbd5e1" />
              }
              {isUploadingStamp && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={24} color="#F5C742" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
            {stampPreview && (
              <button
                onClick={handleRemoveStamp}
                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={12} color="#fff" />
              </button>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1e293b' }}>Company Stamp</p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>PNG, JPG or SVG — max 2 MB. Appears at the bottom-right of print and email templates.</p>
            <button
              onClick={() => stampFileInputRef.current?.click()}
              disabled={isUploadingStamp}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: isUploadingStamp ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500, color: '#334155',
                marginBottom: 16
              }}
            >
              <Upload size={14} />
              {isUploadingStamp ? 'Uploading…' : 'Upload Stamp'}
            </button>
            <input ref={stampFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStampChange} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Toggle
                checked={form.showStampInPrint}
                onChange={v => handleChange('showStampInPrint', v)}
                label="Show stamp in Print Templates"
              />
              <Toggle
                checked={form.showStampInEmail}
                onChange={v => handleChange('showStampInEmail', v)}
                label="Show stamp in Email Templates"
              />
            </div>
          </div>
        </div>

        {/* Company Name */}
        <FormField
          label="Company Name (English)"
          required
          icon={<Building2 size={15} color="#94a3b8" />}
          value={form.companyName}
          onChange={v => handleChange('companyName', v)}
          placeholder="e.g. New Extreme Sports Trading LLC"
        />

        {/* Local Name */}
        <FormField
          label="Company Name (Arabic / Local)"
          icon={<Building2 size={15} color="#94a3b8" />}
          value={form.localName}
          onChange={v => handleChange('localName', v)}
          placeholder="e.g. شركة نيو إكستريم"
        />

        {/* Address */}
        <FormField
          label="Address"
          icon={<MapPin size={15} color="#94a3b8" />}
          value={form.address}
          onChange={v => handleChange('address', v)}
          placeholder="e.g. Hamriyah Free Zone, Sharjah, UAE"
          fullRow
        />

        {/* City */}
        <FormField
          label="City"
          icon={<MapPin size={15} color="#94a3b8" />}
          value={form.city}
          onChange={v => handleChange('city', v)}
          placeholder="e.g. Sharjah"
        />

        {/* Country */}
        <SearchableSelectField
          label="Country"
          icon={<Globe size={15} color="#94a3b8" />}
          options={countryOptions}
          value={form.country}
          onChange={v => handleChange('country', v)}
          placeholder="Search country"
        />

        {/* Phone */}
        <FormField
          label="Phone"
          icon={<Phone size={15} color="#94a3b8" />}
          value={form.phone}
          onChange={v => handleChange('phone', v)}
          placeholder="e.g. +971 6 526 0000"
        />

        {/* Mobile */}
        <FormField
          label="Mobile"
          icon={<Phone size={15} color="#94a3b8" />}
          value={form.mobile}
          onChange={v => handleChange('mobile', v)}
          placeholder="e.g. +971 50 123 4567"
        />

        {/* Email */}
        <FormField
          label="Email"
          icon={<Mail size={15} color="#94a3b8" />}
          value={form.email}
          onChange={v => handleChange('email', v)}
          placeholder="e.g. info@company.com"
        />

        {/* TRN */}
        <FormField
          label="TRN (Tax Registration Number)"
          icon={<Hash size={15} color="#94a3b8" />}
          value={form.trn}
          onChange={v => handleChange('trn', v)}
          placeholder="e.g. 100123456700003"
        />

        {/* Currency */}
        <SearchableSelectField
          label="Currency"
          icon={<DollarSign size={15} color="#94a3b8" />}
          options={currencyOptions}
          value={form.currency}
          onChange={v => handleChange('currency', v)}
          placeholder="Search currency"
        />

        {/* Currency Symbol */}
        <FormField
          label="Currency Symbol"
          icon={<DollarSign size={15} color="#94a3b8" />}
          value={form.currencySymbol}
          onChange={v => handleChange('currencySymbol', v)}
          placeholder="e.g. AED or ₹ or $"
        />

        {/* Website */}
        <FormField
          label="Website"
          icon={<Globe size={15} color="#94a3b8" />}
          value={form.website}
          onChange={v => handleChange('website', v)}
          placeholder="e.g. https://www.company.com"
          fullRow
        />

      </div>

      {/* Save button */}
      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 28px', borderRadius: 8, border: 'none',
            background: isSaving ? '#fcd34d' : '#F5C742',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 14, color: '#1e293b',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'background 0.15s'
          }}
        >
          <Save size={15} />
          {isSaving ? 'Saving…' : 'Save Company Profile'}
        </button>
      </div>
    </div>
  );
};

// ─── Small reusable field component ───────────────────────────────────────────
const FormField = ({ label, required, icon, value, onChange, placeholder, fullRow }) => (
  <div style={{ gridColumn: fullRow ? '1 / -1' : undefined }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        {icon}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '9px 12px 9px 32px',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize: 14,
          color: '#1e293b',
          background: '#fff',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = '#F5C742'}
        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
      />
    </div>
  </div>
);

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#F5C742' : '#e2e8f0',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </div>
    <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
  </label>
);

const SearchableSelectField = ({ label, required, icon, options, value, onChange, placeholder, fullRow }) => (
  <div style={{ gridColumn: fullRow ? '1 / -1' : undefined }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span>{label}</span>
      </span>
      {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
    <SearchableDropdown
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full"
    />
  </div>
);

export default CompanySettings;
