export const trimOptional = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

export const upperOptional = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

export const enumValues = <T extends Record<string, string>>(value: T) => Object.values(value);
export const uniqueValues = (...values: string[][]) => Array.from(new Set(values.flat()));
export const readonlyValues = <T extends readonly string[]>(values: T) => [...values];
