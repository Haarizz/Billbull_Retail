import React, { useState, useRef, useEffect } from 'react';
import { FaDownload, FaFileExcel, FaFilePdf, FaPrint } from 'react-icons/fa';

const ExportDropdown = ({ onExportExcel, onExportPdf, onPrint, disabled = false, style = {} }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOpen = () => {
        if (!disabled) setIsOpen(!isOpen);
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={toggleOpen}
                disabled={disabled}
                style={{
                    padding: '8px 14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    background: '#fff',
                    fontSize: 13,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: disabled ? '#9ca3af' : '#374151',
                    opacity: disabled ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                    ...style
                }}
            >
                <FaDownload style={{ color: '#9ca3af' }} /> Export
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    minWidth: 160,
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                    zIndex: 50,
                    padding: '4px'
                }}>
                    <button
                        onClick={() => { setIsOpen(false); onExportExcel(); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            gap: 8,
                            padding: '8px 12px',
                            border: 'none',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: 13,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <FaFileExcel style={{ color: '#16a34a', fontSize: 14 }} /> Excel (.xlsx)
                    </button>

                    <button
                        onClick={() => { setIsOpen(false); onExportPdf(); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            gap: 8,
                            padding: '8px 12px',
                            border: 'none',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: 13,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <FaFilePdf style={{ color: '#ef4444', fontSize: 14 }} /> PDF (.pdf)
                    </button>

                    {onPrint && (
                        <button
                            onClick={() => { setIsOpen(false); onPrint(); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                gap: 8,
                                padding: '8px 12px',
                                border: 'none',
                                background: 'transparent',
                                color: '#374151',
                                fontSize: 13,
                                fontWeight: 500,
                                borderRadius: 6,
                                cursor: 'pointer',
                                textAlign: 'left',
                                borderTop: '1px solid #f3f4f6'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <FaPrint style={{ color: '#3b82f6', fontSize: 14 }} /> Print
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default ExportDropdown;