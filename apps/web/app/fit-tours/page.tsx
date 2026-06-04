import { Route, Users } from 'lucide-react';
import FitToursClient from './FitToursClient';

export const dynamic = 'force-dynamic';

type Supplier = { id: string; name: string };
type FitTourSummary = {
  id: string;
  quoteCode: string;
  tourCode: string;
  tourName?: string | null;
  customerName: string;
  phone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  adultCount?: number | null;
  childCount?: number | null;
  infantCount?: number | null;
  sellingPrice?: string | number | null;
  workflowStatus?: string | null;
  _count?: { commonCosts: number; hotelCosts: number; privateCosts: number; budgetServices: number; operationServices: number };
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store' });
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
          <p className="eyebrow">Quy trình tour FIT</p>
          <h1>Tour khách lẻ FIT</h1>
        </div>
        <div className="pageHeaderActions">
          <span className="statusPill"><Route size={14} /> 6 bước</span>
          <span className="statusPill statusPillNeutral"><Users size={14} /> Điều hành</span>
        </div>
      </header>

      <FitToursClient suppliers={suppliers} tours={tours} />
    </section>
  );
}
