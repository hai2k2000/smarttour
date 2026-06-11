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
export const TYPED_SUPPLIER_ROUTES = Object.keys(SUPPLIER_TYPE_LABELS) as TypedSupplierRoute[];

export function isTypedSupplierRoute(value: string): value is TypedSupplierRoute {
  return Object.prototype.hasOwnProperty.call(SUPPLIER_TYPE_LABELS, value);
}
