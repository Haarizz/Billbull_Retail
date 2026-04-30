import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCompanyProfile } from '../api/companyProfileApi';
import { getImageUrl } from '../utils/urlUtils';

const CompanyContext = createContext(null);

/**
 * Loads the singleton company profile from the backend on mount and makes it
 * available to the entire component tree via useCompany().
 *
 * The `company` object exposes all DB fields plus a resolved `logoUrl` so
 * components never have to call getImageUrl() themselves.
 */
export const CompanyProvider = ({ children }) => {
    const [company, setCompany] = useState(null);

    useEffect(() => {
        if (!sessionStorage.getItem("token")) return;
        getCompanyProfile()
            .then(res => {
                const profile = res.data;
                setCompany({
                    ...profile,
                    // Resolve relative paths → full URLs once, here
                    logoUrl: profile.logoPath ? getImageUrl(profile.logoPath) : null,
                    stampUrl: profile.stampPath ? getImageUrl(profile.stampPath) : null,
                });
            })
            .catch(() => {
                // API failed — leave company as null.
                // Components should guard with company?.companyName ?? ''.
            });
    }, []);

    /**
     * Call this after a successful profile update or logo upload so every
     * component that reads company context gets the fresh data immediately.
     */
    const refreshCompany = () => {
        return getCompanyProfile()
            .then(res => {
                const profile = res.data;
                const normalizedProfile = {
                    ...profile,
                    logoUrl: profile.logoPath ? getImageUrl(profile.logoPath) : null,
                    stampUrl: profile.stampPath ? getImageUrl(profile.stampPath) : null,
                };
                setCompany(normalizedProfile);
                return normalizedProfile;
            })
            .catch(() => null);
    };

    return (
        <CompanyContext.Provider value={{ company, setCompany, refreshCompany }}>
            {children}
        </CompanyContext.Provider>
    );
};

/**
 * Hook to read the company profile anywhere in the tree.
 *
 * Usage:
 *   const { company } = useCompany();
 *   <img src={company?.logoUrl} />
 */
export const useCompany = () => {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompany must be used within CompanyProvider');
    }
    return context;
};

export default CompanyContext;
