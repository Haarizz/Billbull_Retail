import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useHref } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@billbull/shared/assets/billBullLogo.png', () => ({ default: 'logo.png' }));
vi.mock('@billbull/shared/utils/clientLogger', () => ({ logClientError: vi.fn(), logClientEvent: vi.fn() }));
vi.mock('@billbull/shared/context/CompanyContext', () => ({ useCompany: () => ({ refreshCompany: vi.fn() }) }));
vi.mock('@billbull/shared/context/PermissionContext', () => ({
  PermissionProvider: ({ children }) => children,
  usePermissions: () => ({ permissionsLoaded: true, canView: () => true, refreshPermissions: vi.fn() }),
}));
vi.mock('@billbull/shared/context/BranchContext', () => ({
  useBranch: () => ({ isLoading: false, activeBranchId: 3, branches: [{ id: 3, name: 'Main', code: 'MN' }], canSwitchBranches: false, activeBranch: { id: 3, name: 'Main', code: 'MN' } }),
}));
const authState = { authenticated: false };
vi.mock('@billbull/shared/api/auth', () => ({
  isAuthenticated: () => authState.authenticated,
  login: vi.fn(), persistLoginSession: vi.fn(), describeLoginError: vi.fn(), getDecodedToken: () => null, hasRole: () => false,
}));
vi.mock('@billbull/shared/api/axiosConfig', () => ({ setSessionExpiredHandler: vi.fn() }));
// The real workspace is the 10k-line POSSales; here it only has to report the host it was given.
vi.mock('@billbull/shared/pages/Sales/POSSales', async () => {
  const { usePosHost } = await import('@billbull/shared/pages/Sales/POS/posHost');
  return {
    default: function PosSalesStub() {
      return <div>POS WORKSPACE terminalAdministration={String(usePosHost().terminalAdministration)}</div>;
    },
  };
});

import { TillRoutes } from '../PosApp';
import PosErrorBoundary from '../shell/PosErrorBoundary';

const at = (url) => render(<MemoryRouter initialEntries={[url]}><TillRoutes /></MemoryRouter>);

describe('till routes', () => {
  it('sends a signed-out visitor to the POS login', () => {
    authState.authenticated = false;
    at('/');
    expect(screen.getByText('Sign in with PIN')).toBeTruthy();
  });

  it('sends unknown paths (e.g. Retail routes) to the till, never a back-office page', () => {
    authState.authenticated = false;
    at('/dashboard');
    expect(screen.getByText('Sign in with PIN')).toBeTruthy();
  });

  it('renders the workspace with terminal administration turned on, plus the till rail', () => {
    authState.authenticated = true;
    at('/');
    expect(screen.getByText('POS WORKSPACE terminalAdministration=true')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Till' })).toBeTruthy();
    expect(screen.getByText('MN')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
  });

  it('redirects an already signed-in user away from /login', () => {
    authState.authenticated = true;
    at('/login');
    expect(screen.getByText(/POS WORKSPACE/)).toBeTruthy();
  });
});

// The deployed router basename is '/pos/' (ROUTER_BASE_PATH). With '/pos' React Router writes the
// home route as "/pos" (no slash), and reloading that leaves the till: Vite shows "did you mean to
// visit /pos/?" and the offline service worker (scope /pos/) cannot serve it.
describe('till router basename', () => {
  function Hrefs() {
    return <div>{`home=${useHref('/')} login=${useHref('/login')}`}</div>;
  }

  it('keeps the trailing slash on the till home and nests /login under it', () => {
    render(<MemoryRouter basename="/pos/" initialEntries={['/pos/']}><Hrefs /></MemoryRouter>);
    expect(screen.getByText('home=/pos/ login=/pos/login')).toBeTruthy();
  });

  it('serves the till routes under /pos/', () => {
    authState.authenticated = false;
    render(<MemoryRouter basename="/pos/" initialEntries={['/pos/']}><TillRoutes /></MemoryRouter>);
    expect(screen.getByText('Sign in with PIN')).toBeTruthy();
    cleanup();
    authState.authenticated = true;
    render(<MemoryRouter basename="/pos/" initialEntries={['/pos/login']}><TillRoutes /></MemoryRouter>);
    expect(screen.getByText(/POS WORKSPACE/)).toBeTruthy();
  });
});

describe('PosErrorBoundary', () => {
  const Boom = ({ when }) => { if (when.crash) throw new Error('kaboom'); return <div>till ok</div>; };

  it('never reloads on its own and offers an explicit way back', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const when = { crash: true };
      render(<PosErrorBoundary><Boom when={when} /></PosErrorBoundary>);
      expect(screen.getByText('The till hit a problem')).toBeTruthy();
      expect(screen.getByText('kaboom')).toBeTruthy();
      expect(reload).not.toHaveBeenCalled();
      when.crash = false;
      fireEvent.click(screen.getByText('Return to the till'));
      expect(screen.getByText('till ok')).toBeTruthy();
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
