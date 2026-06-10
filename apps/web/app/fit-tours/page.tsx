import { Route, Users } from 'lucide-react';
import { serverAuthHeaders } from '../serverAuth';
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

type ApiResult<T> = { data: T; error?: string };

async function apiGet<T>(path: string, fallback: T, label: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBase}/api${path}`, { cache: 'no-store', headers: await serverAuthHeaders() });
    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const body = JSON.parse(text);
        detail = Array.isArray(body.message) ? body.message.join(', ') : body.message || body.error || text;
      } catch {
        // Keep the raw response when the API does not return JSON.
      }
      return { data: fallback, error: `${label}: ${detail || `HTTP ${response.status}`}` };
    }
    return { data: await response.json() };
  } catch (error) {
    return { data: fallback, error: `${label}: ${error instanceof Error ? error.message : 'không xác định'}` };
  }
}

export default async function FitToursPage() {
  const [suppliersResult, toursResult] = await Promise.all([
    apiGet<Supplier[]>('/suppliers', [], 'Tải danh sách nhà cung cấp thất bại'),
    apiGet<FitTourSummary[]>('/fit-tours', [], 'Tải danh sách tour FIT thất bại'),
  ]);
  const initialError = [suppliersResult.error, toursResult.error].filter(Boolean).join('. ');

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

      <FitToursClient suppliers={suppliersResult.data} tours={toursResult.data} initialError={initialError} />
    </section>
  );
}
