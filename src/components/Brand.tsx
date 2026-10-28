import { Grid2X2 } from 'lucide-react';

export function Brand() {
  return <div className="tka-brand" aria-label="TOTKA — Try Out TKA">
    <span className="tka-brand-symbol"><Grid2X2 aria-hidden="true" /></span>
    <div>TOTKA<small>TRY OUT TKA</small></div>
  </div>;
}
