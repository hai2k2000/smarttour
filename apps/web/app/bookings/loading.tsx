import { CalendarDays, Loader2 } from 'lucide-react';

export default function BookingsLoading() {
  return (
    <section className="workspace" aria-busy="true">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Quy trình booking</p>
          <h1>Booking tour</h1>
        </div>
        <span className="statusPill"><Loader2 size={14} /> Đang tải</span>
      </header>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Danh sách booking</h2>
          <span>Đang tải dữ liệu...</span>
        </div>
        <div className="tableEmptyState"><Loader2 size={20} /> Đang tải danh sách booking.</div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader">
          <h2>Tạo booking</h2>
        </div>
        <div className="tableEmptyState"><CalendarDays size={20} /> Đang chuẩn bị biểu mẫu booking.</div>
      </section>
    </section>
  );
}
