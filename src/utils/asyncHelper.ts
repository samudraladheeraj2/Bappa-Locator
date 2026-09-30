/**
 * Async utility providing strict timeout guarantees for network/Firestore requests.
 * Ensures the UI never hangs indefinitely on loading spinners.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 7000,
  timeoutMessage = 'Operation timed out after 7 seconds'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((val) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          resolve(val);
        }
      })
      .catch((err) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          reject(err);
        }
      });
  });
}
