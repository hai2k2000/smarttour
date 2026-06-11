export const SUPPLIER_TYPE_LABELS = {
  restaurants: 'Restaurant',
  flights: 'Flight',
  'attraction-tickets': 'Attraction Ticket',
  'landtour-suppliers': 'LandTour Supplier',
  water: 'Water',
  transport: 'Transport',
  bus: 'Bus',
  other: 'Other Cost',
  villas: 'Villa',
  passport: 'Passport Visa',
  guides: 'Tour Guide',
  'series-tickets': 'Series Ticket',
} as const;

export type TypedSupplierRoute = keyof typeof SUPPLIER_TYPE_LABELS;
export type SupplierMetadataFieldType = 'text' | 'number' | 'date' | 'time' | 'datetime';

export const SUPPLIER_TYPE_CATEGORY_ALIASES: Record<TypedSupplierRoute, readonly string[]> = {
  restaurants: [],
  flights: ['Flight Ticket'],
  'attraction-tickets': [],
  'landtour-suppliers': ['Landtour'],
  water: [],
  transport: ['Vehicle'],
  bus: [],
  other: [],
  villas: [],
  passport: [],
  guides: [],
  'series-tickets': [],
};

export const SUPPLIER_TYPE_METADATA_FIELDS: Record<TypedSupplierRoute, Readonly<Record<string, SupplierMetadataFieldType>>> = {
  restaurants: {},
  flights: {
    ticketType: 'text', route: 'text', departureAirport: 'text', departureDate: 'date', departureTime: 'time',
    arrivalAirport: 'text', returnDate: 'date', returnTime: 'time', depositDeadline: 'datetime',
    nameDeadline: 'datetime', fullpayDeadline: 'datetime', taxPrice: 'number', airportFee: 'number',
    issueFee: 'number', commission: 'number',
  },
  'attraction-tickets': {},
  'landtour-suppliers': {
    supplierTourCode: 'text', duration: 'text', departurePlace: 'text', destinationPlace: 'text', tourType: 'text',
    departureSchedule: 'text', capacity: 'number', childPolicy: 'text', cancelPolicy: 'text', paymentPolicy: 'text',
  },
  water: { packageSize: 'text', unit: 'text' },
  transport: {
    licensePlate: 'text', seatCapacity: 'number', driverName: 'text', driverPhone: 'text', dailyPrice: 'number',
    kmPrice: 'number', overtimePrice: 'number', fuelIncluded: 'text',
  },
  bus: {
    routeCode: 'text', departureStation: 'text', arrivalStation: 'text', departureTime: 'time', arrivalTime: 'time', seatType: 'text',
  },
  other: { unit: 'text' },
  villas: {
    bedroomCount: 'number', capacity: 'number', hasPool: 'text', hasBbq: 'text', hasKitchen: 'text',
    checkinTime: 'time', checkoutTime: 'time',
  },
  passport: { country: 'text', documentType: 'text', processingTime: 'text', requiredDocuments: 'text' },
  guides: {
    birthday: 'date', phone: 'text', email: 'text', idNumber: 'text', guideCardNumber: 'text', languages: 'text',
    regions: 'text', dailyRate: 'number',
  },
  'series-tickets': {
    seriesCode: 'text', route: 'text', depositDeadline: 'date', nameDeadline: 'date', fullPaymentDeadline: 'date',
  },
};

export const TYPED_SUPPLIER_ROUTES = Object.keys(SUPPLIER_TYPE_LABELS) as TypedSupplierRoute[];

export function isTypedSupplierRoute(value: string): value is TypedSupplierRoute {
  return Object.prototype.hasOwnProperty.call(SUPPLIER_TYPE_LABELS, value);
}

export function supplierTypeCategoryNames(type: TypedSupplierRoute) {
  return [SUPPLIER_TYPE_LABELS[type], ...SUPPLIER_TYPE_CATEGORY_ALIASES[type]];
}
