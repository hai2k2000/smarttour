export type SupplierFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  uploadedBy?: string | null;
  createdAt?: string;
};

export function supplierFileHref(apiBase: string, fileUrl: string) {
  return `${apiBase}${fileUrl}`;
}
