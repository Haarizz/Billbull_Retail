import { Alert } from '../../../ui/kit';

const SWITCHES = {
  console: 'BILLBULL_PLATFORM_DB_CONSOLE_ENABLED=true',
  writes: 'BILLBULL_PLATFORM_DB_CONSOLE_ENABLED=true and BILLBULL_PLATFORM_DB_CONSOLE_ALLOW_WRITES=true',
  backups: 'BILLBULL_PLATFORM_BACKUPS_ENABLED=true',
};

/** Which server switch turns a capability on; shown wherever a switched-off feature is reached. */
export default function CapabilityHint({ what }) {
  return (
    <Alert kind="info">
      Switched off on this client&apos;s server. The client controls it: add <code className="text-xs">{SWITCHES[what]}</code> to
      its environment file (<code className="text-xs">/etc/billbull/&lt;client&gt;.env</code>) and restart the backend.
    </Alert>
  );
}
