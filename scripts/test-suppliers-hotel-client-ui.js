#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

const site = (process.env.SITE_URL || process.env.WEB_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const token = process.env.HOTEL_CLIENT_TEST_TOKEN || process.env.ADMIN_TOKEN || '';
const outDir = process.env.OUT_DIR || '/tmp/smarttour-hotel-suppliers-client-test';

if (!token) {
  console.error('Set HOTEL_CLIENT_TEST_TOKEN or ADMIN_TOKEN for Hotel Suppliers Client UI test');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeName(name) {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'step';
}

function responseJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

function messageResponse(route, message, status = 400) {
  return responseJson(route, { message }, status);
}

function isBadConsole(message) {
  if (!['error', 'warning'].includes(message.type())) return false;
  const text = message.text();
  if (/Failed to load resource: the server responded with a status of 404.*favicon/i.test(text)) return false;
  if (/Download the React DevTools/i.test(text)) return false;
  if (/HTTP 500 - Lỗi mock danh sách khách sạn/i.test(text)) return false;
  return /error|failed|exception|typeerror|referenceerror|hydration|cannot read/i.test(text);
}

function baseHotel() {
  return {
    id: 'hotel-1',
    supplierCode: 'HOT-OLD',
    name: 'Khách sạn Hồ Gươm',
    taxCode: 'TAX-OLD',
    phone: '0901234567',
    email: 'old-hotel@smarttour.local',
    country: 'Việt Nam',
    province: 'Hà Nội',
    address: '36 Hàng Trống',
    website: 'https://hotel-old.example.com',
    notes: 'Ghi chú cũ',
    status: 'ACTIVE',
    hotelProfile: {
      builtYear: 2018,
      rating: 4,
      classHotel: '4 sao',
      hotelProject: 'Dự án Hồ Gươm',
      bankAccountName: 'Công ty Khách sạn Hồ Gươm',
      bankAccountNumber: '123456789',
      bankName: 'Smart Bank',
      market: 'Nội địa',
      link: 'https://hotel-old.example.com/ref',
    },
    contacts: [{
      id: 'contact-1',
      fullName: 'Nguyễn Lan',
      position: 'Sales',
      birthday: '1990-01-02T23:00:00-05:00',
      phone: '0912345678',
      email: 'lan@hotel.example.com',
    }],
    supplierServices: [{
      id: 'service-1',
      sku: 'ROOM-STD',
      serviceName: 'Phòng tiêu chuẩn',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
      dayType: 'WEEKDAY',
      accountingPrice: 800000,
      netPrice: 700000,
      sellingPrice: 950000,
      description: 'Dịch vụ lưu trú cũ',
      note: 'Ghi chú dịch vụ cũ',
    }],
    allotments: [{
      id: 'allotment-1',
      serviceId: 'service-1',
      sku: 'ALLOT-STD',
      serviceName: 'Deluxe hướng hồ',
      startDate: '2026-06-01',
      endDate: '2026-08-31',
      dayType: 'WEEKEND',
      allotmentQty: 8,
      bookedQty: 2,
      lockedQty: 1,
      quantityLock: 1,
      cutoffDays: 7,
      netCostPerDay: 900000,
      sellingPricePerDay: 1250000,
      status: 'ACTIVE',
      computedStatus: 'ACTIVE',
      remainingQty: 5,
      overbookedQty: 0,
      occupancyRate: 25,
      sellThroughRate: 37.5,
      isCodLocked: false,
      description: 'Quỹ phòng cũ',
      note: 'Ghi chú quỹ phòng cũ',
      allocations: [{
        id: 'allocation-1',
        quantity: 1,
        status: 'LOCKED',
        bookingId: 'booking-1',
        note: 'Giữ chỗ cũ',
        createdAt: '2026-06-10T00:00:00.000Z',
      }],
    }],
    files: [{
      id: 'file-1',
      fileName: 'hop-dong-cu.pdf',
      fileUrl: '/api/files/download?key=hotel/file-1',
      fileType: 'application/pdf',
      uploadedBy: 'seed-user',
      createdAt: '2026-06-10T00:00:00.000Z',
    }],
  };
}

function hotelWithoutProfile() {
  return {
    id: 'hotel-2',
    supplierCode: 'HOT-SAFE',
    name: 'Khách sạn Không Có Hồ Sơ',
    taxCode: null,
    phone: '0902222222',
    email: null,
    country: null,
    province: 'Huế',
    address: null,
    website: null,
    notes: null,
    status: 'INACTIVE',
    hotelProfile: null,
    rating: 3,
    bankAccountName: 'Tài khoản dữ liệu cũ',
    market: 'Dữ liệu cũ',
    contacts: [],
    supplierServices: [],
    allotments: [],
    files: [],
  };
}

function fromPayload(payload, id) {
  return normalizeHotel({
    id,
    supplierCode: payload.supplierCode || null,
    name: payload.name,
    taxCode: payload.taxCode || null,
    phone: payload.phone || null,
    email: payload.email || null,
    country: payload.country || 'Việt Nam',
    province: payload.province || null,
    address: payload.address || null,
    website: payload.website || null,
    notes: payload.notes || null,
    status: payload.status || 'ACTIVE',
    hotelProfile: {
      builtYear: payload.builtYear ?? null,
      rating: payload.rating ?? null,
      classHotel: payload.classHotel || '',
      hotelProject: payload.hotelProject || '',
      bankAccountName: payload.bankAccountName || null,
      bankAccountNumber: payload.bankAccountNumber || null,
      bankName: payload.bankName || null,
      market: payload.market || null,
      link: payload.link || null,
    },
    contacts: (payload.contacts || []).map((item, index) => ({ id: item.id || `created-contact-${index + 1}`, ...item })),
    supplierServices: (payload.services || []).map((item, index) => ({ id: `created-service-${index + 1}`, ...item })),
    allotments: (payload.allotments || []).map((item, index) => ({
      id: `created-allotment-${index + 1}`,
      serviceId: item.serviceId || null,
      bookedQty: item.bookedQty || 0,
      lockedQty: item.lockedQty || 0,
      quantityLock: item.lockedQty || 0,
      computedStatus: item.status || 'ACTIVE',
      remainingQty: Math.max(0, (item.allotmentQty || 0) - (item.bookedQty || 0) - (item.lockedQty || 0)),
      overbookedQty: Math.max(0, (item.bookedQty || 0) + (item.lockedQty || 0) - (item.allotmentQty || 0)),
      allocations: [],
      ...item,
    })),
    files: [],
  });
}

function normalizeHotel(hotel) {
  for (const allotment of hotel.allotments || []) {
    const total = Number(allotment.allotmentQty ?? allotment.quantityLock ?? 0);
    const booked = Number(allotment.bookedQty || 0);
    const locked = Number(allotment.lockedQty ?? allotment.quantityLock ?? 0);
    allotment.lockedQty = locked;
    allotment.quantityLock = locked;
    allotment.remainingQty = Math.max(0, total - booked - locked);
    allotment.overbookedQty = Math.max(0, booked + locked - total);
    allotment.computedStatus = allotment.computedStatus || allotment.status || 'ACTIVE';
    allotment.sellThroughRate = total > 0 ? Math.round(((booked + locked) / total) * 1000) / 10 : 0;
    allotment.occupancyRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  }
  return hotel;
}

function haystack(hotel) {
  return [
    hotel.supplierCode,
    hotel.name,
    hotel.taxCode,
    hotel.phone,
    hotel.email,
    hotel.country,
    hotel.province,
    hotel.address,
    hotel.website,
    hotel.notes,
    hotel.hotelProfile?.classHotel,
    hotel.hotelProfile?.hotelProject,
    hotel.hotelProfile?.market,
    hotel.hotelProfile?.bankName,
    ...(hotel.contacts || []).flatMap((item) => [item.fullName, item.position, item.phone, item.email]),
    ...(hotel.supplierServices || []).flatMap((item) => [item.sku, item.serviceName, item.description, item.note]),
    ...(hotel.allotments || []).flatMap((item) => [item.sku, item.serviceName, item.description, item.note]),
  ].filter(Boolean).join(' ').toLowerCase();
}

function makeState() {
  const state = {
    hotels: [normalizeHotel(baseHotel()), normalizeHotel(hotelWithoutProfile())],
    bookings: [{ id: 'booking-1', code: 'BKG-CLIENT-001', customerName: 'Đoàn test UI', startDate: '2026-07-01' }],
    calls: {
      listQueries: [],
      createPayloads: [],
      updatePayloads: [],
      contactCreates: [],
      contactUpdates: [],
      contactDeletes: [],
      serviceCreates: [],
      serviceUpdates: [],
      serviceDeletes: [],
      allotmentCreates: [],
      allotmentUpdates: [],
      allotmentDeletes: [],
      uploads: [],
      deletes: [],
      overrides: [],
      locks: [],
      confirms: [],
      releases: [],
    },
    failNextList: false,
  };
  return state;
}

function filteredHotels(state, searchParams) {
  state.calls.listQueries.push(Object.fromEntries(searchParams.entries()));
  let rows = state.hotels;
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const status = (searchParams.get('status') || '').trim();
  const province = (searchParams.get('province') || '').trim().toLowerCase();
  const market = (searchParams.get('market') || '').trim().toLowerCase();
  const hotelProject = (searchParams.get('hotelProject') || '').trim().toLowerCase();
  const classHotel = (searchParams.get('classHotel') || '').trim().toLowerCase();
  if (status) rows = rows.filter((hotel) => hotel.status === status);
  if (province) rows = rows.filter((hotel) => String(hotel.province || '').toLowerCase().includes(province));
  if (market) rows = rows.filter((hotel) => String(hotel.hotelProfile?.market || '').toLowerCase().includes(market));
  if (hotelProject) rows = rows.filter((hotel) => String(hotel.hotelProfile?.hotelProject || '').toLowerCase().includes(hotelProject));
  if (classHotel) rows = rows.filter((hotel) => String(hotel.hotelProfile?.classHotel || '').toLowerCase().includes(classHotel));
  if (search) rows = rows.filter((hotel) => haystack(hotel).includes(search));
  return rows.map(clone);
}

function inventoryRows(state, searchParams) {
  const supplierId = (searchParams.get('supplierId') || '').trim();
  return state.hotels
    .filter((hotel) => !supplierId || hotel.id === supplierId)
    .flatMap((hotel) => (hotel.allotments || []).map((allotment) => ({
      ...clone(allotment),
      supplier: { id: hotel.id, name: hotel.name, supplierCode: hotel.supplierCode },
      allocationSummary: {
        locked: (allotment.allocations || []).filter((item) => item.status === 'LOCKED').length,
        confirmed: (allotment.allocations || []).filter((item) => item.status === 'CONFIRMED').length,
        released: (allotment.allocations || []).filter((item) => item.status === 'RELEASED').length,
      },
      activeAllocationCount: (allotment.allocations || []).filter((item) => ['LOCKED', 'CONFIRMED'].includes(item.status)).length,
    })));
}

function findHotelByAllotment(state, allotmentId) {
  for (const hotel of state.hotels) {
    const allotment = (hotel.allotments || []).find((item) => item.id === allotmentId);
    if (allotment) return { hotel, allotment };
  }
  return {};
}

async function installApiMock(page, state) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiIndex = url.pathname.indexOf('/api/');
    const apiPath = apiIndex >= 0 ? url.pathname.slice(apiIndex) : url.pathname;
    const method = request.method();

    if (apiPath === '/api/auth/me') {
      return responseJson(route, { id: 'hotel-ui-user', name: 'Hotel UI Tester', permissions: ['supplier.view', 'supplier.manage'] });
    }

    if (method === 'GET' && apiPath === '/api/suppliers/hotels') {
      if (state.failNextList) {
        state.failNextList = false;
        return messageResponse(route, 'Lỗi mock danh sách khách sạn', 500);
      }
      return responseJson(route, filteredHotels(state, url.searchParams));
    }

    const hotelDetailMatch = apiPath.match(/^\/api\/suppliers\/hotels\/([^/]+)$/);
    if (hotelDetailMatch && method === 'GET') {
      const hotel = state.hotels.find((item) => item.id === hotelDetailMatch[1]);
      return hotel ? responseJson(route, clone(hotel)) : messageResponse(route, 'Không tìm thấy nhà cung cấp khách sạn', 404);
    }

    if (apiPath === '/api/suppliers/hotels' && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      state.calls.createPayloads.push(payload);
      const hotel = fromPayload(payload, `hotel-created-${state.calls.createPayloads.length}`);
      state.hotels.push(hotel);
      return responseJson(route, clone(hotel), 201);
    }

    if (hotelDetailMatch && method === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}');
      state.calls.updatePayloads.push(payload);
      const hotel = state.hotels.find((item) => item.id === hotelDetailMatch[1]);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp khách sạn', 404);
      for (const key of ['supplierCode', 'name', 'taxCode', 'phone', 'email', 'country', 'province', 'address', 'website', 'notes', 'status']) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) hotel[key] = payload[key] || null;
      }
      for (const key of ['builtYear', 'rating', 'classHotel', 'hotelProject', 'bankAccountName', 'bankAccountNumber', 'bankName', 'market', 'link']) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) hotel.hotelProfile[key] = payload[key] ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'contacts')) hotel.contacts = payload.contacts.map((item) => ({ ...item }));
      if (Object.prototype.hasOwnProperty.call(payload, 'services')) {
        hotel.supplierServices = payload.services.map((item, index) => ({ id: `updated-service-${index + 1}`, ...item }));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'allotments')) {
        hotel.allotments = payload.allotments.map((item, index) => normalizeHotel({ allotments: [{ id: `updated-allotment-${index + 1}`, ...item }] }).allotments[0]);
      }
      normalizeHotel(hotel);
      return responseJson(route, clone(hotel));
    }

    const contactMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/contacts(?:\/([^/]+))?$/);
    if (contactMatch) {
      const supplierId = contactMatch[1];
      const contactId = contactMatch[2];
      const hotel = state.hotels.find((item) => item.id === supplierId);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp', 404);
      hotel.contacts = hotel.contacts || [];
      if (method === 'POST' && !contactId) {
        const payload = JSON.parse(request.postData() || '{}');
        const contact = { id: `created-contact-${state.calls.contactCreates.length + 1}`, ...payload };
        state.calls.contactCreates.push({ supplierId, payload });
        hotel.contacts.push(contact);
        return responseJson(route, clone(contact), 201);
      }
      if (method === 'PUT' && contactId) {
        const payload = JSON.parse(request.postData() || '{}');
        const index = hotel.contacts.findIndex((item) => item.id === contactId);
        if (index < 0) return messageResponse(route, 'Không tìm thấy liên hệ', 404);
        const contact = { ...hotel.contacts[index], ...payload, id: contactId };
        state.calls.contactUpdates.push({ supplierId, contactId, payload });
        hotel.contacts[index] = contact;
        return responseJson(route, clone(contact));
      }
      if (method === 'DELETE' && contactId) {
        state.calls.contactDeletes.push({ supplierId, contactId });
        hotel.contacts = hotel.contacts.filter((item) => item.id !== contactId);
        return responseJson(route, { ok: true });
      }
    }

    const serviceMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/services(?:\/([^/]+))?$/);
    if (serviceMatch) {
      const supplierId = serviceMatch[1];
      const serviceId = serviceMatch[2];
      const hotel = state.hotels.find((item) => item.id === supplierId);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp', 404);
      hotel.supplierServices = hotel.supplierServices || [];
      if (method === 'POST' && !serviceId) {
        const payload = JSON.parse(request.postData() || '{}');
        const service = { id: `created-service-${state.calls.serviceCreates.length + 1}`, ...payload };
        state.calls.serviceCreates.push({ supplierId, payload });
        hotel.supplierServices.push(service);
        return responseJson(route, clone(service), 201);
      }
      if (method === 'PUT' && serviceId) {
        const payload = JSON.parse(request.postData() || '{}');
        const index = hotel.supplierServices.findIndex((item) => item.id === serviceId);
        if (index < 0) return messageResponse(route, 'Không tìm thấy dịch vụ', 404);
        const service = { ...hotel.supplierServices[index], ...payload, id: serviceId };
        state.calls.serviceUpdates.push({ supplierId, serviceId, payload });
        hotel.supplierServices[index] = service;
        return responseJson(route, clone(service));
      }
      if (method === 'DELETE' && serviceId) {
        state.calls.serviceDeletes.push({ supplierId, serviceId });
        hotel.supplierServices = hotel.supplierServices.filter((item) => item.id !== serviceId);
        return responseJson(route, { ok: true });
      }
    }

    const allotmentMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/allotments(?:\/([^/]+))?$/);
    if (allotmentMatch) {
      const supplierId = allotmentMatch[1];
      const allotmentId = allotmentMatch[2];
      const hotel = state.hotels.find((item) => item.id === supplierId);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp', 404);
      hotel.allotments = hotel.allotments || [];
      if (method === 'POST' && !allotmentId) {
        const payload = JSON.parse(request.postData() || '{}');
        const allotment = normalizeHotel({ allotments: [{ id: `created-allotment-${state.calls.allotmentCreates.length + 1}`, ...payload }] }).allotments[0];
        state.calls.allotmentCreates.push({ supplierId, payload });
        hotel.allotments.push(allotment);
        return responseJson(route, clone(allotment), 201);
      }
      if (method === 'PUT' && allotmentId) {
        const payload = JSON.parse(request.postData() || '{}');
        const index = hotel.allotments.findIndex((item) => item.id === allotmentId);
        if (index < 0) return messageResponse(route, 'Không tìm thấy quỹ phòng', 404);
        const allotment = normalizeHotel({ allotments: [{ ...hotel.allotments[index], ...payload, id: allotmentId }] }).allotments[0];
        state.calls.allotmentUpdates.push({ supplierId, allotmentId, payload });
        hotel.allotments[index] = allotment;
        return responseJson(route, clone(allotment));
      }
      if (method === 'DELETE' && allotmentId) {
        state.calls.allotmentDeletes.push({ supplierId, allotmentId });
        hotel.allotments = hotel.allotments.filter((item) => item.id !== allotmentId);
        return responseJson(route, { ok: true });
      }
    }

    const uploadMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/files$/);
    if (uploadMatch && method === 'POST') {
      const hotel = state.hotels.find((item) => item.id === uploadMatch[1]);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp', 404);
      const body = request.postData() || '';
      const filename = /filename="([^"]+)"/.exec(body)?.[1] || `hotel-upload-${state.calls.uploads.length + 1}.txt`;
      const file = {
        id: `uploaded-file-${state.calls.uploads.length + 1}`,
        fileName: filename,
        fileUrl: `/api/files/download?key=hotel/${filename}`,
        fileType: 'text/plain',
        uploadedBy: 'hotel-ui-user',
        createdAt: new Date().toISOString(),
      };
      state.calls.uploads.push(file);
      hotel.files = [file, ...(hotel.files || [])];
      return responseJson(route, clone(file), 201);
    }

    const deleteFileMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/files\/([^/]+)$/);
    if (deleteFileMatch && method === 'DELETE') {
      const hotel = state.hotels.find((item) => item.id === deleteFileMatch[1]);
      if (!hotel) return messageResponse(route, 'Không tìm thấy nhà cung cấp', 404);
      state.calls.deletes.push({ supplierId: deleteFileMatch[1], fileId: deleteFileMatch[2] });
      hotel.files = (hotel.files || []).filter((file) => file.id !== deleteFileMatch[2]);
      return responseJson(route, { ok: true });
    }

    if (apiPath === '/api/suppliers/hotel-allotments/inventory' && method === 'GET') {
      return responseJson(route, inventoryRows(state, url.searchParams));
    }

    const overrideMatch = apiPath.match(/^\/api\/suppliers\/hotel-allotments\/([^/]+)\/override$/);
    if (overrideMatch && method === 'PATCH') {
      const payload = JSON.parse(request.postData() || '{}');
      state.calls.overrides.push(payload);
      const { allotment } = findHotelByAllotment(state, overrideMatch[1]);
      if (!allotment) return messageResponse(route, 'Không tìm thấy quỹ phòng', 404);
      allotment.allotmentQty = payload.allotmentQty;
      allotment.status = payload.status;
      allotment.computedStatus = payload.status;
      normalizeHotel({ allotments: [allotment] });
      return responseJson(route, clone(allotment));
    }

    const lockMatch = apiPath.match(/^\/api\/suppliers\/hotel-allotments\/([^/]+)\/lock$/);
    if (lockMatch && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      state.calls.locks.push(payload);
      const { allotment } = findHotelByAllotment(state, lockMatch[1]);
      if (!allotment) return messageResponse(route, 'Không tìm thấy quỹ phòng', 404);
      const allocation = {
        id: `allocation-${Date.now()}`,
        quantity: payload.quantity,
        status: 'LOCKED',
        bookingId: payload.bookingId || null,
        note: payload.note || null,
        createdAt: new Date().toISOString(),
      };
      allotment.allocations = [allocation, ...(allotment.allocations || [])];
      allotment.lockedQty = Number(allotment.lockedQty || 0) + Number(payload.quantity || 0);
      normalizeHotel({ allotments: [allotment] });
      return responseJson(route, { allocation: clone(allocation), inventory: clone(allotment) }, 201);
    }

    const allocationActionMatch = apiPath.match(/^\/api\/suppliers\/hotel-allotment-allocations\/([^/]+)\/(confirm|release)$/);
    if (allocationActionMatch && method === 'POST') {
      const [, allocationId, action] = allocationActionMatch;
      const payload = JSON.parse(request.postData() || '{}');
      for (const hotel of state.hotels) {
        for (const allotment of hotel.allotments || []) {
          const allocation = (allotment.allocations || []).find((item) => item.id === allocationId);
          if (!allocation) continue;
          if (action === 'confirm') {
            state.calls.confirms.push(payload);
            if (allocation.status === 'LOCKED') {
              allocation.status = 'CONFIRMED';
              allotment.lockedQty = Math.max(0, Number(allotment.lockedQty || 0) - Number(allocation.quantity || 0));
              allotment.bookedQty = Number(allotment.bookedQty || 0) + Number(allocation.quantity || 0);
            }
          } else {
            state.calls.releases.push(payload);
            if (allocation.status === 'LOCKED') allotment.lockedQty = Math.max(0, Number(allotment.lockedQty || 0) - Number(allocation.quantity || 0));
            if (allocation.status === 'CONFIRMED') allotment.bookedQty = Math.max(0, Number(allotment.bookedQty || 0) - Number(allocation.quantity || 0));
            allocation.status = 'RELEASED';
            allocation.note = payload.note || allocation.note;
          }
          normalizeHotel({ allotments: [allotment] });
          return responseJson(route, { allocation: clone(allocation), inventory: clone(allotment) }, 201);
        }
      }
      return messageResponse(route, 'Không tìm thấy phân bổ quỹ phòng', 404);
    }

    if (apiPath === '/api/bookings' && method === 'GET') return responseJson(route, clone(state.bookings));

    return messageResponse(route, `Mock chưa hỗ trợ ${method} ${apiPath}`, 501);
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${safeName(name)}.png`), fullPage: false });
}

async function visibleText(pageOrLocator, text, exact = false) {
  const locator = pageOrLocator.getByText(text, { exact });
  const ownerPage = typeof pageOrLocator.waitForTimeout === 'function' ? pageOrLocator : pageOrLocator.page();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) return;
    }
    await ownerPage.waitForTimeout(100);
  }
  await locator.first().waitFor({ state: 'visible', timeout: 1000 });
}

async function selectDialog(page, name) {
  const dialog = page.getByRole('dialog', { name });
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  return dialog;
}

async function confirmNext(page, matcher) {
  page.once('dialog', async (dialog) => {
    if (matcher) assert(matcher.test(dialog.message()), `Unexpected dialog: ${dialog.message()}`);
    await dialog.accept();
  });
}

async function acceptPromptThenConfirm(page, promptText, confirmMatcher) {
  let index = 0;
  page.on('dialog', async function handler(dialog) {
    index += 1;
    if (index === 1) {
      await dialog.accept(promptText);
      return;
    }
    page.off('dialog', handler);
    if (confirmMatcher) assert(confirmMatcher.test(dialog.message()), `Unexpected confirm dialog: ${dialog.message()}`);
    await dialog.accept();
  });
}

function dynamicSection(dialog, title) {
  return dialog.locator('section.fitTableBlock').filter({ hasText: title });
}

async function addAndRemoveRow(page, section, title) {
  const firstRow = section.locator('tbody tr').first();
  const valuesBefore = await firstRow.locator('input, select, textarea').evaluateAll((fields) => fields.map((field) => field.value));
  await section.getByRole('button', { name: 'Thêm dòng' }).click();
  assert(await section.locator('tbody tr').count() === 2, `${title} should add a row`);
  await confirmNext(page, /Xóa dòng 2/);
  await section.getByRole('button', { name: 'Xóa dòng 2' }).click();
  assert(await section.locator('tbody tr').count() === 1, `${title} should remove the extra row`);
  const valuesAfter = await firstRow.locator('input, select, textarea').evaluateAll((fields) => fields.map((field) => field.value));
  assert(JSON.stringify(valuesAfter) === JSON.stringify(valuesBefore), `${title} should preserve the first row values after adding and removing another row`);
}

async function loadMockedList(page) {
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await visibleText(page, 'Khách sạn Hồ Gươm');
}

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const state = makeState();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true });
  const siteUrl = new URL(site);
  await context.addCookies([{
    name: 'smarttour.auth.token',
    value: token,
    url: siteUrl.origin,
    httpOnly: true,
    secure: siteUrl.protocol === 'https:',
    sameSite: 'Lax',
  }]);
  await context.addInitScript(() => {
    window.localStorage.removeItem('smarttour.auth.token');
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify({
      id: 'hotel-ui-user',
      name: 'Hotel UI Tester',
      permissions: ['supplier.view', 'supplier.manage'],
    }));
  });

  const page = await context.newPage();
  const issues = [];
  const step = { value: 'bootstrap' };
  page.on('console', (message) => {
    if (step.value === 'api error state' && /Failed to load resource: the server responded with a status of 500/i.test(message.text())) return;
    if (isBadConsole(message)) issues.push({ step: step.value, type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => issues.push({ step: step.value, type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => {
    if (/favicon\.ico/i.test(request.url())) return;
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    issues.push({ step: step.value, type: 'requestfailed', text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}` });
  });
  await installApiMock(page, state);

  async function run(name, fn) {
    step.value = name;
    await fn();
    await page.waitForTimeout(200);
    await screenshot(page, name);
    console.log(`OK HOTEL_CLIENT ${name}`);
  }

  try {
    await page.goto(`${siteUrl.origin}/suppliers/hotels`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (page.url().includes('/login')) throw new Error('Hotel suppliers page redirected to login');
    await visibleText(page, 'Nhà cung cấp khách sạn', true);

    await run('hotel list is prioritized before empty inventory', async () => {
      await visibleText(page, 'Danh sách nhà cung cấp khách sạn');
      const listTop = await page.getByRole('heading', { name: 'Danh sách nhà cung cấp khách sạn' }).first().boundingBox();
      const inventoryTop = await page.getByRole('heading', { name: 'Tồn quỹ phòng theo ngày' }).first().boundingBox();
      assert(listTop && inventoryTop, 'hotel list and inventory headings must be visible');
      assert(listTop.y < inventoryTop.y, 'hotel supplier list should render before the inventory table so imported hotels are visible immediately');
    });

    await run('supplier navigation highlights current tab only', async () => {
      const activeModuleLinks = await page.locator('.moduleStripInner a.active').evaluateAll((links) => links.map((link) => link.textContent?.trim()).filter(Boolean));
      assert(activeModuleLinks.length === 1 && activeModuleLinks[0] === 'Khách sạn', `expected only Khách sạn tab active, got ${activeModuleLinks.join(', ')}`);
    });

    await run('search filter list', async () => {
      await loadMockedList(page);
      const filterPanel = page.locator('.supplierFilterPanel');
      await filterPanel.getByPlaceholder(/Tìm mã, tên/).fill('Hồ Gươm');
      await filterPanel.getByLabel('Tỉnh/thành').fill('Hà Nội');
      await filterPanel.getByLabel('Thị trường').fill('Nội địa');
      await filterPanel.getByLabel('Dự án khách sạn').fill('Hồ Gươm');
      await filterPanel.getByLabel('Hạng khách sạn').fill('4 sao');
      await filterPanel.getByLabel('Trạng thái').selectOption('ACTIVE');
      await filterPanel.getByRole('button', { name: /Lọc danh sách/ }).click();
      await visibleText(page, 'Khách sạn Hồ Gươm');
      const lastQuery = state.calls.listQueries.at(-1);
      assert(lastQuery.search === 'Hồ Gươm' && lastQuery.province === 'Hà Nội' && lastQuery.status === 'ACTIVE', 'filter query must match backend contract');
    });

    await run('create form defaults validation rows submit', async () => {
      await page.getByRole('button', { name: /Thêm nhà cung cấp khách sạn/ }).click();
      const dialog = await selectDialog(page, 'Tạo nhà cung cấp khách sạn');
      assert(await dialog.getByLabel('Quốc gia').inputValue() === 'Việt Nam', 'create form should default country to Việt Nam');
      assert(await dialog.locator('fieldset').filter({ hasText: 'Thông tin khách sạn' }).getByLabel('Trạng thái').inputValue() === 'ACTIVE', 'create form should default status to ACTIVE');
      const contactSection = dynamicSection(dialog, 'Người liên hệ');
      const serviceSection = dynamicSection(dialog, 'Dịch vụ khách sạn');
      const allotmentSection = dynamicSection(dialog, 'Quỹ phòng ban đầu');
      assert(await contactSection.locator('tbody tr').count() === 1, 'create form should start with one empty contact row');
      assert(await serviceSection.locator('tbody tr').count() === 1, 'create form should start with one empty service row');
      assert(await allotmentSection.locator('tbody tr').count() === 1, 'create form should start with one empty allotment row');
      assert(await serviceSection.locator('tbody tr').first().locator('select').first().inputValue() === 'ALL_DAYS', 'service dayType should default to ALL_DAYS');
      assert(await allotmentSection.locator('tbody tr').first().locator('select').first().inputValue() === 'ALL_DAYS', 'allotment dayType should default to ALL_DAYS');
      assert(await allotmentSection.locator('tbody tr').first().locator('select').nth(1).inputValue() === 'ACTIVE', 'allotment status should default to ACTIVE');
      assert(await allotmentSection.locator('tbody tr').first().locator('select').nth(1).locator('option[value="INACTIVE"]').textContent() === 'Ngừng hoạt động', 'inactive allotment status must use the shared Vietnamese label');
      assert(await serviceSection.locator('input[type="number"]').first().getAttribute('step') === 'any', 'service money inputs must allow decimal values');
      assert(await allotmentSection.locator('input[type="number"]').first().getAttribute('step') === '1', 'allotment quantity inputs must remain integers');
      assert(await allotmentSection.locator('input[type="number"]').nth(2).getAttribute('step') === 'any', 'allotment money inputs must allow decimal values');

      await dialog.getByRole('button', { name: 'Tạo nhà cung cấp khách sạn' }).click();
      await visibleText(dialog, 'Cần nhập mã nhà cung cấp');
      await visibleText(dialog, 'Cần nhập tên khách sạn');
      await visibleText(dialog, 'Cần nhập số điện thoại nhà cung cấp');
      await visibleText(dialog, 'Cần chọn hoặc nhập hạng khách sạn');
      await visibleText(dialog, 'Cần nhập dòng sản phẩm hoặc dự án khách sạn');
      assert(state.calls.createPayloads.length === 0, 'invalid create form must not call API');

      await dialog.getByLabel('Mã nhà cung cấp').fill('HOT-NEW');
      await dialog.getByLabel('Tên khách sạn').fill('Khách sạn Test Mới');
      await dialog.getByLabel('Số điện thoại').fill('0900000000');
      await dialog.getByLabel('Hạng khách sạn').fill('5 sao');
      await dialog.getByLabel('Dòng sản phẩm / dự án').fill('Dự án Test');
      await dialog.getByLabel('Tỉnh/thành').fill('Đà Nẵng');

      const contactRow = contactSection.locator('tbody tr').first();
      await contactRow.locator('input').nth(0).fill('Trần Test');
      await contactRow.locator('input').nth(1).fill('Điều phối');
      await contactRow.locator('input').nth(3).fill('0911111111');

      const serviceRow = serviceSection.locator('tbody tr').first();
      await serviceRow.locator('input').nth(0).fill('SPA');
      await serviceRow.locator('input').nth(1).fill('Dịch vụ spa');
      await serviceRow.locator('select').first().selectOption('WEEKDAY');
      await serviceRow.locator('input').nth(5).fill('300000');

      const allotmentRow = allotmentSection.locator('tbody tr').first();
      await allotmentRow.locator('input').nth(0).fill('DLX');
      await allotmentRow.locator('input').nth(1).fill('Deluxe test');
      await allotmentRow.locator('select').first().selectOption('WEEKEND');
      await allotmentRow.locator('input').nth(4).fill('12');
      await allotmentRow.locator('input').nth(5).fill('7');

      await addAndRemoveRow(page, contactSection, 'contacts');
      await addAndRemoveRow(page, serviceSection, 'services');
      await addAndRemoveRow(page, allotmentSection, 'allotments');

      await dialog.getByRole('button', { name: 'Tạo nhà cung cấp khách sạn' }).click();
      await visibleText(page, 'Đã tạo nhà cung cấp khách sạn');
      await visibleText(page, 'Khách sạn Test Mới');
      const payload = state.calls.createPayloads[0];
      assert(payload.country === 'Việt Nam' && payload.status === 'ACTIVE', 'create payload must include friendly defaults');
      assert(payload.contacts.length === 1 && payload.services.length === 1 && payload.allotments.length === 1, 'create payload must include only kept child rows');
      assert(payload.services[0].dayType === 'WEEKDAY' && payload.allotments[0].dayType === 'WEEKEND', 'create payload must keep selected dayType values');
    });

    await run('edit load old data upload delete file', async () => {
      const oldRow = page.locator('table.hotelListTable tbody tr', { hasText: 'Khách sạn Hồ Gươm' }).first();
      await oldRow.getByRole('button', { name: 'Sửa khách sạn' }).click();
      const dialog = await selectDialog(page, 'Cập nhật nhà cung cấp khách sạn');
      assert(await dialog.getByLabel('Tên khách sạn').inputValue() === 'Khách sạn Hồ Gươm', 'edit form must load old name');
      assert(await dialog.getByLabel('Số điện thoại').inputValue() === '0901234567', 'edit form must load old phone');
      assert(await dialog.getByLabel('Dòng sản phẩm / dự án').inputValue() === 'Dự án Hồ Gươm', 'edit form must load old hotel profile');
      assert(await dynamicSection(dialog, 'Người liên hệ').locator('tbody tr').first().locator('input').nth(0).inputValue() === 'Nguyễn Lan', 'edit form must load old contact rows');
      assert(await dynamicSection(dialog, 'Dịch vụ khách sạn').locator('tbody tr').first().locator('input').nth(1).inputValue() === 'Phòng tiêu chuẩn', 'edit form must load old service rows');
      assert(await dynamicSection(dialog, 'Người liên hệ').locator('tbody tr').first().locator('input').nth(2).inputValue() === '1990-01-02', 'date-only mapping must preserve the source calendar date across timezones');
      await visibleText(dialog, 'Quỹ phòng được quản lý riêng');
      await visibleText(dialog, 'hop-dong-cu.pdf');

      const fileInput = dialog.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'blocked-script.js',
        mimeType: 'application/javascript',
        buffer: Buffer.from('alert(1)'),
      });
      await visibleText(page, 'Loại file "blocked-script.js" không được phép tải lên.');
      assert(await fileInput.evaluate((input) => input.files.length) === 0, 'invalid pending files must be cleared before upload');

      await fileInput.setInputFiles({
        name: 'hotel-upload-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hotel upload client test'),
      });
      await visibleText(dialog, 'Đã chọn 1 file: hotel-upload-test.txt');
      await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
      await visibleText(page, 'Đã cập nhật nhà cung cấp khách sạn và tải lên 1 file');
      assert(state.calls.uploads.length === 1, 'edit submit must upload pending file');
      const updatePayload = state.calls.updatePayloads.at(-1);
      assert(!Object.prototype.hasOwnProperty.call(updatePayload, 'contacts'), 'untouched contacts must not be sent on edit');
      assert(!Object.prototype.hasOwnProperty.call(updatePayload, 'services'), 'untouched services must not be sent on edit');
      assert(!Object.prototype.hasOwnProperty.call(updatePayload, 'allotments'), 'untouched allotments must not be sent on edit');

      await oldRow.getByRole('button', { name: 'Sửa khách sạn' }).click();
      const editAgain = await selectDialog(page, 'Cập nhật nhà cung cấp khách sạn');
      await visibleText(editAgain, 'hotel-upload-test.txt');
      await confirmNext(page, /Xóa file "hotel-upload-test.txt"/);
      await editAgain.getByRole('button', { name: /Xóa file hotel-upload-test\.txt/ }).click();
      await visibleText(page, 'Đã xóa file "hotel-upload-test.txt"');
      assert(state.calls.deletes.some((item) => item.fileId === 'uploaded-file-1'), 'file delete must call supplier file endpoint');
      await editAgain.getByRole('button', { name: 'Đóng' }).click();

      const contactUpdatesBefore = state.calls.contactUpdates.length;
      const serviceUpdatesBefore = state.calls.serviceUpdates.length;
      await oldRow.getByRole('button', { name: 'Sửa khách sạn' }).click();
      const childDialog = await selectDialog(page, 'Cập nhật nhà cung cấp khách sạn');
      const contactRow = dynamicSection(childDialog, 'Người liên hệ').locator('tbody tr').first();
      await contactRow.locator('input').nth(0).fill('Nguyễn Lan cập nhật');
      const serviceRow = dynamicSection(childDialog, 'Dịch vụ khách sạn').locator('tbody tr').first();
      await serviceRow.locator('input').nth(1).fill('Phòng tiêu chuẩn cập nhật');
      await childDialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
      await visibleText(page, 'Đã cập nhật nhà cung cấp khách sạn');
      const childParentPayload = state.calls.updatePayloads.at(-1);
      assert(!Object.prototype.hasOwnProperty.call(childParentPayload, 'contacts'), 'dirty contacts must not be sent through parent hotel edit');
      assert(!Object.prototype.hasOwnProperty.call(childParentPayload, 'services'), 'dirty services must not be sent through parent hotel edit');
      assert(!Object.prototype.hasOwnProperty.call(childParentPayload, 'allotments'), 'hotel edit must not replace allotments while syncing other child rows');
      assert(state.calls.contactUpdates.length === contactUpdatesBefore + 1, 'dirty contact edit must call contact child endpoint');
      assert(state.calls.contactUpdates.at(-1).contactId === 'contact-1' && state.calls.contactUpdates.at(-1).payload.fullName === 'Nguyễn Lan cập nhật', 'contact child endpoint must receive the existing contact id and payload');
      assert(state.calls.serviceUpdates.length === serviceUpdatesBefore + 1, 'dirty service edit must call service child endpoint');
      assert(state.calls.serviceUpdates.at(-1).serviceId === 'service-1' && state.calls.serviceUpdates.at(-1).payload.serviceName === 'Phòng tiêu chuẩn cập nhật', 'service child endpoint must receive the existing service id and payload');
      assert(state.calls.contactCreates.length === 0 && state.calls.contactDeletes.length === 0, 'editing an existing contact must not create/delete contact rows');
      assert(state.calls.serviceCreates.length === 0 && state.calls.serviceDeletes.length === 0, 'editing an existing service must not create/delete service rows');

      await page.locator('.supplierFilterPanel').getByRole('button', { name: 'Xóa bộ lọc' }).click();
      await visibleText(page, 'Khách sạn Không Có Hồ Sơ');
      const safeRow = page.locator('table.hotelListTable tbody tr', { hasText: 'Khách sạn Không Có Hồ Sơ' }).first();
      await safeRow.getByRole('button', { name: 'Sửa khách sạn' }).click();
      const safeDialog = await selectDialog(page, 'Cập nhật nhà cung cấp khách sạn');
      assert(await safeDialog.getByLabel('Quốc gia').inputValue() === 'Việt Nam', 'missing country should use the localized create/edit fallback');
      assert(await safeDialog.getByLabel('Thị trường').inputValue() === 'Dữ liệu cũ', 'missing hotel profile should preserve legacy root profile data');
      assert(await dynamicSection(safeDialog, 'Người liên hệ').locator('tbody tr').count() === 1, 'empty contacts should map to one editable blank row');
      assert(await dynamicSection(safeDialog, 'Dịch vụ khách sạn').locator('tbody tr').count() === 1, 'empty services should map to one editable blank row');
      await safeDialog.getByRole('button', { name: 'Đóng' }).click();
    });

    await run('allotment actions', async () => {
      const oldRow = page.locator('table.hotelListTable tbody tr', { hasText: 'Khách sạn Hồ Gươm' }).first();
      await oldRow.getByRole('button', { name: 'Quản lý quỹ phòng' }).click();
      const modal = await selectDialog(page, 'Quản lý quỹ phòng');
      await visibleText(modal, 'Deluxe hướng hồ');

      await modal.getByRole('button', { name: /Điều chỉnh/ }).first().click();
      let action = await selectDialog(page, 'Điều chỉnh quỹ phòng');
      await action.getByLabel('Tổng quỹ phòng').fill('10');
      await action.getByLabel('Lý do điều chỉnh').fill('Điều chỉnh test client');
      await confirmNext(page, /Xác nhận điều chỉnh quỹ phòng/);
      await action.getByRole('button', { name: /Xác nhận điều chỉnh/ }).click();
      await visibleText(page, 'Điều chỉnh quỹ phòng thành công.');
      assert(state.calls.overrides.at(-1).allotmentQty === 10, 'override action must send allotment quantity');

      await modal.getByRole('button', { name: /^Giữ chỗ$/ }).first().click();
      action = await selectDialog(page, 'Giữ chỗ quỹ phòng');
      await action.getByLabel('Số phòng giữ chỗ').fill('2');
      await action.getByLabel('Booking liên quan').selectOption('booking-1');
      await action.getByLabel('Ghi chú').fill('Giữ chỗ test client');
      await confirmNext(page, /Xác nhận giữ 2 phòng/);
      await action.getByRole('button', { name: /^Giữ chỗ$/ }).click();
      await visibleText(page, 'Giữ chỗ quỹ phòng thành công.');
      assert(state.calls.locks.at(-1).quantity === 2 && state.calls.locks.at(-1).bookingId === 'booking-1', 'lock action must send quantity and booking linkage');

      await confirmNext(page, /Xác nhận phân bổ quỹ phòng/);
      await modal.getByRole('button', { name: /^Xác nhận$/ }).first().click();
      await visibleText(page, 'Xác nhận phân bổ quỹ phòng thành công.');
      assert(state.calls.confirms.length >= 1, 'confirm allocation must call confirm endpoint');

      await acceptPromptThenConfirm(page, 'Giải phóng test client', /Giải phóng phân bổ quỹ phòng/);
      await modal.getByRole('button', { name: /^Giải phóng$/ }).first().click();
      await visibleText(page, 'Giải phóng phân bổ quỹ phòng thành công.');
      assert(state.calls.releases.at(-1).note === 'Giải phóng test client', 'release allocation must send reason note');
      await modal.getByRole('button', { name: 'Đóng' }).click();
    });

    await run('api error state', async () => {
      state.failNextList = true;
      await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
      await visibleText(page, 'Không tải được danh sách nhà cung cấp khách sạn.');
      await visibleText(page, 'HTTP 500 - Lỗi mock danh sách khách sạn');
      assert(await page.locator('table.hotelListTable tbody tr', { hasText: 'Khách sạn Hồ Gươm' }).count() === 0, 'list API errors must not leave stale hotel rows visible');
    });

    if (issues.length) {
      await fs.writeFile(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2));
      throw new Error(`Hotel Suppliers Client UI test captured ${issues.length} issue(s); see ${outDir}/issues.json`);
    }

    console.log(`TEST_SUPPLIERS_HOTEL_CLIENT_UI_OK output=${outDir}`);
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, `failure-${safeName(step.value)}.png`), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(outDir, 'failure.txt'), error.stack || error.message).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
