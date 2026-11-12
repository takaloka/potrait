export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (response.status === 413) {
      throw new ApiError("Unggahan terlalu besar. Foto maksimal 8 MB; pilih foto yang lebih kecil.", 413);
    }
    throw new ApiError("Server belum dapat dihubungi. Coba lagi sebentar.", response.status);
  }
  if (!response.ok) {
    const body = data as { error?: string | { message?: string }; message?: string };
    throw new ApiError(
      body.message || (typeof body.error === "string" ? body.error : body.error?.message) || "Permintaan belum berhasil. Coba lagi.",
      response.status,
    );
  }
  return data as T;
}
