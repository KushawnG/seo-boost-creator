
export const createBlobFromArrayBuffer = async (buffer: ArrayBuffer, type: string): Promise<Blob> => {
  const uint8Array = new Uint8Array(buffer);
  return new Blob([uint8Array], { type });
};
