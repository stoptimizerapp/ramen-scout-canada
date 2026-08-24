export function createRetryableLoader<T>(load: () => Promise<T>) {
  let request: Promise<T> | null = null;

  return () => {
    request ??= load().catch((error) => {
      request = null;
      throw error;
    });
    return request;
  };
}
