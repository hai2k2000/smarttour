import { authHeaders } from '../authFetch';

export type SupplierFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
};

export async function uploadSupplierFiles(apiBase: string, supplierId: string, files: File[]) {
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${apiBase}/api/suppliers/${supplierId}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    if (!response.ok) throw new Error(`Upload file thất bại: ${file.name}`);
  }
}

export function supplierFileHref(apiBase: string, fileUrl: string) {
  return `${apiBase}${fileUrl}`;
}
