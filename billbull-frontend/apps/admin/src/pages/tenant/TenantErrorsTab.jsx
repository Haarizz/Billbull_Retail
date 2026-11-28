import ErrorLogsPage from '../ErrorLogsPage';

/** One client's error logs, inside the client page. */
export default function TenantErrorsTab({ tenant }) {
  return <ErrorLogsPage tenantId={tenant.id} embedded />;
}
