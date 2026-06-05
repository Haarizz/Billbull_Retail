import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Building2,
  Save,
  Upload,
  X,
  Globe,
  Phone,
  Mail,
  MapPin,
  Hash,
  DollarSign,
  RefreshCw,
  Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown';
import { getCompanyProfile, updateCompanyProfile, uploadCompanyLogo, uploadCompanyStamp } from '../../api/companyProfileApi';
import { useCompany } from '../../context/CompanyContext';
import { getImageUrl } from '../../utils/urlUtils';
import {
  getCountryOptions,
  getCurrencyOptions,
  getCurrencySymbol,
  normalizeCountryValue,
  normalizeCurrencyValue,
  withFallbackOption
} from '../../utils/countryCurrencyOptions';

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

const resolveCurrencySymbol = (symbol, currency) => {
  const normalizedCurrency = normalizeCurrencyValue(currency);
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim() : '';

  return normalizedSymbol || getCurrencySymbol(normalizedCurrency);
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getCompanyProfile();
        const p = res.data;
        const normalizedCurrency = normalizeCurrencyValue(p.currency || '');

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
          currency: normalizedCurrency,
          currencySymbol: resolveCurrencySymbol(p.currencySymbol, normalizedCurrency),
          website: p.website || '',
          showStampInPrint: p.showStampInPrint !== false,
          showStampInEmail: p.showStampInEmail !== false,
        });

        setLogoPath(p.logoPath || '');
        if (p.logoPath) {
          setLogoPreview(getImageUrl(p.logoPath));
        }

        setStampPath(p.stampPath || '');
        if (p.stampPath) {
          setStampPreview(getImageUrl(p.stampPath));
        }
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
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCurrencyChange = (value) => {
    const currency = normalizeCurrencyValue(value);

    setForm((prev) => ({
      ...prev,
      currency,
      currencySymbol: getCurrencySymbol(currency)
    }));
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    if (stampFileInputRef.current) {
      stampFileInputRef.current.value = '';
    }
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
        currencySymbol: resolveCurrencySymbol(form.currencySymbol, form.currency),
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
        <span>Loading company profile...</span>
        <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: '#F5F7FA' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #DCE3EB', padding: '20px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF6D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={20} color="#C98A00" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#020617', letterSpacing: 0 }}>Company Profile</h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#475569' }}>
                Manage the identity used across invoices, quotations, emails, and printed documents.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: isSaving ? '#e2e8f0' : '#F5C742',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 14,
              color: isSaving ? '#64748b' : '#0f172a',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
            }}
          >
            {isSaving ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
            {isSaving ? 'Saving...' : 'Save Company Profile'}
          </button>
        </div>
      </header>

      <main style={{ padding: 28 }}>
        <div style={{ display: 'grid', gap: 24 }}>
          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
            <SectionCard
              title="Company Logo"
              description="Used on invoices, quotations, and print templates. PNG, JPG, or SVG up to 2 MB."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={mediaPreviewStyle}>
                    {logoPreview ? (
                      <img src={logoPreview} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Building2 size={42} color="#cbd5e1" />
                    )}
                    {isUploadingLogo && (
                      <div style={mediaOverlayStyle}>
                        <RefreshCw size={24} color="#F5C742" style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}
                  </div>
                  {logoPreview && (
                    <button type="button" onClick={handleRemoveLogo} style={removeMediaButtonStyle}>
                      <X size={12} color="#fff" />
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 220 }}>
                  <p style={mediaTitleStyle}>Upload or replace your primary company logo.</p>
                  <p style={mediaTextStyle}>
                    This branding appears anywhere the company details are printed or emailed.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    style={secondaryButtonStyle(isUploadingLogo)}
                  >
                    <Upload size={14} />
                    {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Company Stamp"
              description="Shown on print and email templates when stamp visibility is enabled."
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={mediaPreviewStyle}>
                    {stampPreview ? (
                      <img src={stampPreview} alt="Company Stamp" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }} />
                    ) : (
                      <Award size={42} color="#cbd5e1" />
                    )}
                    {isUploadingStamp && (
                      <div style={mediaOverlayStyle}>
                        <RefreshCw size={24} color="#F5C742" style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                    )}
                  </div>
                  {stampPreview && (
                    <button type="button" onClick={handleRemoveStamp} style={removeMediaButtonStyle}>
                      <X size={12} color="#fff" />
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 240 }}>
                  <p style={mediaTitleStyle}>Control how your official stamp appears on documents.</p>
                  <p style={mediaTextStyle}>
                    Great for invoice sign-off, approved delivery notes, and formal email attachments.
                  </p>
                  <button
                    type="button"
                    onClick={() => stampFileInputRef.current?.click()}
                    disabled={isUploadingStamp}
                    style={{ ...secondaryButtonStyle(isUploadingStamp), marginBottom: 16 }}
                  >
                    <Upload size={14} />
                    {isUploadingStamp ? 'Uploading...' : 'Upload Stamp'}
                  </button>
                  <input ref={stampFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStampChange} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Toggle
                      checked={form.showStampInPrint}
                      onChange={(value) => handleChange('showStampInPrint', value)}
                      label="Show stamp in print templates"
                    />
                    <Toggle
                      checked={form.showStampInEmail}
                      onChange={(value) => handleChange('showStampInEmail', value)}
                      label="Show stamp in email templates"
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <SectionCard
              title="Company Identity"
              description="Core naming details shown at the top of customer-facing documents."
            >
              <div style={sectionGridStyle}>
                <FormField
                  label="Company Name (English)"
                  required
                  icon={<Building2 size={15} color="#94a3b8" />}
                  value={form.companyName}
                  onChange={(value) => handleChange('companyName', value)}
                  placeholder="e.g. New Extreme Sports Trading LLC"
                />
                <FormField
                  label="Company Name (Arabic / Local)"
                  icon={<Building2 size={15} color="#94a3b8" />}
                  value={form.localName}
                  onChange={(value) => handleChange('localName', value)}
                  placeholder="Local language company name"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Contact & Location"
              description="Address and contact details printed on invoices, quotations, and delivery paperwork."
            >
              <div style={sectionGridStyle}>
                <FormField
                  label="Address"
                  icon={<MapPin size={15} color="#94a3b8" />}
                  value={form.address}
                  onChange={(value) => handleChange('address', value)}
                  placeholder="e.g. Hamriyah Free Zone, Sharjah, UAE"
                  fullRow
                />
                <FormField
                  label="City"
                  icon={<MapPin size={15} color="#94a3b8" />}
                  value={form.city}
                  onChange={(value) => handleChange('city', value)}
                  placeholder="e.g. Sharjah"
                />
                <SearchableSelectField
                  label="Country"
                  icon={<Globe size={15} color="#94a3b8" />}
                  options={countryOptions}
                  value={form.country}
                  onChange={(value) => handleChange('country', value)}
                  placeholder="Search country"
                />
                <FormField
                  label="Phone"
                  icon={<Phone size={15} color="#94a3b8" />}
                  value={form.phone}
                  onChange={(value) => handleChange('phone', value)}
                  placeholder="e.g. +971 6 526 0000"
                />
                <FormField
                  label="Mobile"
                  icon={<Phone size={15} color="#94a3b8" />}
                  value={form.mobile}
                  onChange={(value) => handleChange('mobile', value)}
                  placeholder="e.g. +971 50 123 4567"
                />
                <FormField
                  label="Email"
                  icon={<Mail size={15} color="#94a3b8" />}
                  value={form.email}
                  onChange={(value) => handleChange('email', value)}
                  placeholder="e.g. info@company.com"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Commercial Details"
              description="Tax, currency, and website information used in sales and accounting documents."
            >
              <div style={sectionGridStyle}>
                <FormField
                  label="TRN (Tax Registration Number)"
                  icon={<Hash size={15} color="#94a3b8" />}
                  value={form.trn}
                  onChange={(value) => handleChange('trn', value)}
                  placeholder="e.g. 100123456700003"
                />
                <SearchableSelectField
                  label="Currency"
                  icon={<DollarSign size={15} color="#94a3b8" />}
                  options={currencyOptions}
                  value={form.currency}
                  onChange={handleCurrencyChange}
                  placeholder="Search currency"
                />
                <CurrencySymbolField
                  label="Currency Symbol"
                  icon={<DollarSign size={15} color="#94a3b8" />}
                  currency={form.currency}
                  value={form.currencySymbol}
                  onChange={(value) => handleChange('currencySymbol', value)}
                  placeholder="e.g. AED or Rs or $"
                />
                <FormField
                  label="Website"
                  icon={<Globe size={15} color="#94a3b8" />}
                  value={form.website}
                  onChange={(value) => handleChange('website', value)}
                  placeholder="e.g. https://www.company.com"
                />
              </div>
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  );
};

const panelStyle = {
  background: '#fff',
  border: '1px solid #DCE3EB',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)'
};

const sectionGridStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
};

const mediaPreviewStyle = {
  width: 132,
  height: 132,
  borderRadius: 16,
  border: '2px dashed #E2E8F0',
  background: '#F8FAFC',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  position: 'relative'
};

const mediaOverlayStyle = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(255,255,255,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const removeMediaButtonStyle = {
  position: 'absolute',
  top: -8,
  right: -8,
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: '#ef4444',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const mediaTitleStyle = {
  margin: '0 0 6px',
  fontWeight: 600,
  fontSize: 14,
  color: '#0f172a'
};

const mediaTextStyle = {
  margin: '0 0 14px',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#64748b'
};

const secondaryButtonStyle = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 16px',
  borderRadius: 10,
  border: '1px solid #DCE3EB',
  background: disabled ? '#f8fafc' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: '#334155'
});

const SectionCard = ({ title, description, children }) => (
  <section style={panelStyle}>
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#020617' }}>{title}</h2>
      {description && (
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: '#64748b' }}>
          {description}
        </p>
      )}
    </div>
    {children}
  </section>
);

const FormField = ({ label, required, icon, value, onChange, placeholder, fullRow }) => (
  <div style={{ gridColumn: fullRow ? '1 / -1' : undefined }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
      {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        {icon}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '11px 12px 11px 34px',
          border: '1px solid #DCE3EB',
          borderRadius: 12,
          fontSize: 14,
          color: '#1e293b',
          background: '#fff',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#F5C742';
          e.target.style.boxShadow = '0 0 0 4px rgba(245, 199, 66, 0.15)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = '#DCE3EB';
          e.target.style.boxShadow = 'none';
        }}
      />
    </div>
  </div>
);

const CurrencySymbolField = ({ label, required, icon, currency, value, onChange, placeholder, fullRow }) => (
  <FormField
    label={label}
    required={required}
    icon={icon}
    value={value}
    onChange={onChange}
    placeholder={placeholder || getCurrencySymbol(currency)}
    fullRow={fullRow}
  />
);

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? '#F5C742' : '#e2e8f0',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    </div>
    <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{label}</span>
  </label>
);

const SearchableSelectField = ({ label, required, icon, options, value, onChange, placeholder, fullRow }) => (
  <div style={{ gridColumn: fullRow ? '1 / -1' : undefined }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
