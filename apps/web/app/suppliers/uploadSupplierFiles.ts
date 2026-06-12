export type SupplierFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
};

export function supplierFileHref(apiBase: string, fileUrl: string) {
  return `${apiBase}${fileUrl}`;
}
