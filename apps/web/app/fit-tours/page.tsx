import { Route, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
import FitTourWizard from './FitTourWizard';

export const dynamic = 'force-dynamic';

type Supplier = { id: string; name: string };
type FitTourSummary = { id: string; quoteCode: string; tourCode: string; customerName: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

export default async function FitToursPage() {
  const [suppliers, tours] = await Promise.all([
    apiGet<Supplier[]>('/suppliers', []),
    apiGet<FitTourSummary[]>('/fit-tours', []),
  ]);

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">FIT TourKit workflow</p>
          <h1>Tour khach le FIT</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><Route size={14} /> 6 buoc</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Operator</span>
        </div>
      </header>

      <FitTourWizard suppliers={suppliers} tours={tours} />
    </section>
  );
}
