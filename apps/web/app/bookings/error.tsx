'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function BookingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy trình booking</p>
          <h1>Booking tour</h1>
        </div>
      </header>

      <section className="panel listPanel">
        <div className="supplierNotice supplierNoticeError">
          <AlertTriangle size={16} /> Không tải được trang booking. {error.message || 'Vui lòng thử lại.'}
        </div>
        <div className="modalActions">
          <button type="button" className="secondaryButton iconTextButton" onClick={reset}>
            <RotateCcw size={14} /> Tải lại
          </button>
          <a className="secondaryButton" href="/dashboard">Về dashboard</a>
        </div>
      </section>
    </section>
  );
}
