#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "FAIL_WORKSPACE_PAGES_CONTRACT $1" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing_file:$file"
}

require_grep() {
  local pattern="$1"
  local file="$2"
  grep -Fq "$pattern" "$file" || fail "missing_pattern:$pattern in $file"
}

require_file apps/web/app/workspace/page.tsx
require_file apps/web/app/workspace/overview/page.tsx
require_file apps/web/app/workspace/workspace-data.ts

require_grep "redirect('/workspace')" apps/web/app/page.tsx

require_grep "Bàn làm việc" apps/web/app/AppShell.tsx
require_grep "href: '/workspace'" apps/web/app/AppShell.tsx
require_grep "Tổng quan" apps/web/app/AppShell.tsx
require_grep "href: '/workspace/overview'" apps/web/app/AppShell.tsx

require_grep "workspaceDeskPage" apps/web/app/workspace/page.tsx
require_grep "Hồ sơ chuyên viên" apps/web/app/workspace/page.tsx
require_grep "Thông tin cá nhân" apps/web/app/workspace/page.tsx
require_grep "Thông báo bạn cần quan tâm" apps/web/app/workspace/page.tsx
require_grep "Lịch khởi hành" apps/web/app/workspace/page.tsx
require_grep "Công việc của tôi" apps/web/app/workspace/page.tsx

require_grep "workspaceOverviewPage" apps/web/app/workspace/overview/page.tsx
require_grep "CEO Analytics" apps/web/app/workspace/overview/page.tsx
require_grep "Doanh thu & chi phí" apps/web/app/workspace/overview/page.tsx
require_grep "Điều hành khởi hành" apps/web/app/workspace/overview/page.tsx
require_grep "Doanh số theo dòng sản phẩm" apps/web/app/workspace/overview/page.tsx
require_grep "Phân tích thị trường địa lý" apps/web/app/workspace/overview/page.tsx
require_grep "Top khách hàng trung thành" apps/web/app/workspace/overview/page.tsx
if grep -Fq "Phiếu bán hàng thông minh" apps/web/app/workspace/overview/page.tsx; then
  fail "removed_section_still_present:Phiếu bán hàng thông minh"
fi
if grep -Fq "Báo cáo tài chính sâu" apps/web/app/workspace/overview/page.tsx; then
  fail "removed_section_still_present:Báo cáo tài chính sâu"
fi

require_grep "getWorkspaceData" apps/web/app/workspace/workspace-data.ts
require_grep "getWorkspaceOverviewData" apps/web/app/workspace/workspace-data.ts
require_grep "/api/reports/overview" apps/web/app/workspace/workspace-data.ts
require_grep "/api/reports/finance" apps/web/app/workspace/workspace-data.ts
require_grep "/api/order-center" apps/web/app/workspace/workspace-data.ts
require_grep "/api/reports/revenue/by-type" apps/web/app/workspace/workspace-data.ts
require_grep "/api/reports/revenue/by-market" apps/web/app/workspace/workspace-data.ts
require_grep "/api/order-center?compact=true&take=120" apps/web/app/workspace/workspace-data.ts
require_grep "getWorkspaceOverviewData" apps/web/app/workspace/overview/page.tsx

require_grep ".workspaceDeskPage" apps/web/app/globals.css
require_grep ".workspaceOverviewPage" apps/web/app/globals.css
require_grep ".workspaceCalendarGrid" apps/web/app/globals.css
require_grep ".workspaceMiniChartBar" apps/web/app/globals.css
require_grep ".workspaceProductSalesTable" apps/web/app/globals.css
require_grep ".workspaceMarketGrid" apps/web/app/globals.css

echo "TEST_WORKSPACE_PAGES_CONTRACT_OK"
