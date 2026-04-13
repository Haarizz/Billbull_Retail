import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaExclamationTriangle } from 'react-icons/fa';

/**
 * Error Boundary for RBAC 403 Forbidden errors.
 * Shows user-friendly message when access is denied.
 */
class RBACErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('RBAC Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <RBACErrorFallback error={this.state.error} />;
        }

        return this.props.children;
    }
}

/**
 * Fallback UI for RBAC errors.
 */
const RBACErrorFallback = ({ error }) => {
    const navigate = useNavigate();

    const is403 = error?.response?.status === 403 || error?.message?.includes('403');

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <FaExclamationTriangle size={64} style={styles.icon} />
                <h1 style={styles.title}>
                    {is403 ? 'Access Denied' : 'Something Went Wrong'}
                </h1>
                <p style={styles.message}>
                    {is403
                        ? "You don't have permission to access this resource. Please contact your administrator if you believe this is an error."
                        : error?.message || 'An unexpected error occurred.'}
                </p>
                <div style={styles.buttonGroup}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{ ...styles.button, ...styles.primaryButton }}
                    >
                        Go to Dashboard
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        style={{ ...styles.button, ...styles.secondaryButton }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#F7F7FA',
        padding: '20px',
    },
    card: {
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '48px',
        maxWidth: '500px',
        textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    },
    icon: {
        color: '#F59E0B',
        marginBottom: '24px',
    },
    title: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#1E1E1E',
        marginBottom: '16px',
    },
    message: {
        fontSize: '16px',
        color: '#64748B',
        marginBottom: '32px',
        lineHeight: '1.6',
    },
    buttonGroup: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
    },
    button: {
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        border: 'none',
        transition: 'all 0.2s',
    },
    primaryButton: {
        backgroundColor: '#F5C742',
        color: '#1E1E1E',
    },
    secondaryButton: {
        backgroundColor: '#E2E8F0',
        color: '#334155',
    },
};

export default RBACErrorBoundary;
