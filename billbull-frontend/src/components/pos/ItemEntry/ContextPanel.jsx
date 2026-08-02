import React from 'react';

const ContextPanel = ({ children }) => {
    return (
        <div className="flex flex-col gap-4 w-full h-full">
            {children}
        </div>
    );
};

export default ContextPanel;
