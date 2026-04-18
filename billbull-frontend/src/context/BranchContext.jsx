import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDefaultBranch } from '../api/branchApi';

const BranchContext = createContext(null);

export const BranchProvider = ({ children }) => {
    const [defaultBranch, setDefaultBranch] = useState(null);

    const load = () => {
        if (!sessionStorage.getItem("token")) return;
        getDefaultBranch()
            .then(data => setDefaultBranch(data))
            .catch(() => {});
    };

    useEffect(() => {
        load();
    }, []);

    return (
        <BranchContext.Provider value={{ defaultBranch, refreshDefaultBranch: load }}>
            {children}
        </BranchContext.Provider>
    );
};

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (!context) throw new Error('useBranch must be used within BranchProvider');
    return context;
};

export default BranchContext;
