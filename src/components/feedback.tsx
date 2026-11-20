import { Check } from 'lucide-react';

/** Result of the last action: an alert for the error, a polite status for the success. */
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return <>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {success && <div className="success-banner" role="status"><Check size={16} aria-hidden="true" />{success}</div>}
  </>;
}
