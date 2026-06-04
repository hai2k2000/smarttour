export const orderRouteTypes = ['fit-tours', 'git-combos', 'landtours', 'hotel-bookings', 'flight-orders', 'single-services'] as const;

export type OrderRouteType = (typeof orderRouteTypes)[number];

export type OrderConfig = {
  pageTitle: string;
  title: string;
  shortTitle: string;
  workflowLabel: string;
  steps: string[];
  nameLabel: string;
  codeLabel: string;
};

export const orderConfigs: Record<OrderRouteType, OrderConfig> = {
  'fit-tours': { pageTitle: 'Đơn tour FIT', title: 'Tạo tour khách lẻ FIT', shortTitle: 'Đơn tour FIT', workflowLabel: 'FIT', nameLabel: 'Tên tour', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  'git-combos': { pageTitle: 'Đơn GIT / Combo', title: 'Tạo tour GIT / Combo', shortTitle: 'Đơn GIT / Combo', workflowLabel: 'GIT / Combo', nameLabel: 'Lịch trình', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Danh sách thành viên', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  landtours: { pageTitle: 'Đơn LandTour', title: 'Tạo đơn LandTour', shortTitle: 'Đơn LandTour', workflowLabel: 'LandTour', nameLabel: 'Lịch trình', codeLabel: 'Mã tour', steps: ['Tính giá', 'Thông tin tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ'] },
  'hotel-bookings': { pageTitle: 'Booking phòng khách sạn', title: 'Tạo booking phòng khách sạn', shortTitle: 'Booking phòng khách sạn', workflowLabel: 'Phòng khách sạn', nameLabel: 'Tên tour / dịch vụ', codeLabel: 'Mã booking', steps: ['Thông tin booking', 'Dịch vụ và giá', 'Danh sách thành viên', 'Điều khoản', 'Đánh giá dịch vụ'] },
  'flight-orders': { pageTitle: 'Booking vé máy bay', title: 'Tạo booking vé máy bay', shortTitle: 'Booking vé máy bay', workflowLabel: 'Vé máy bay', nameLabel: 'Tên booking / PNR', codeLabel: 'Mã vé', steps: ['Thông tin vé', 'Chặng bay', 'Hành khách', 'Điều khoản', 'Đánh giá'] },
  'single-services': { pageTitle: 'Đơn dịch vụ lẻ', title: 'Tạo đơn dịch vụ lẻ', shortTitle: 'Đơn dịch vụ lẻ', workflowLabel: 'Dịch vụ lẻ', nameLabel: 'Tên dịch vụ', codeLabel: 'Mã đơn', steps: ['Thông tin dịch vụ', 'Dịch vụ và giá', 'Danh sách thành viên', 'Điều khoản', 'Đánh giá'] },
};

export const orderNavigation = orderRouteTypes.map((type) => ({
  type,
  href: `/orders/${type}`,
  label: orderConfigs[type].pageTitle,
  workflowLabel: orderConfigs[type].workflowLabel,
}));

export function isOrderRouteType(value: string): value is OrderRouteType {
  return orderRouteTypes.includes(value as OrderRouteType);
}
