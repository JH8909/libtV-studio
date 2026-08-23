/** Shared abort/sleep helpers for provider adapters. */

export function abortError() {
  return Object.assign(new Error("canceled"), { name: "AbortError" });
}

export function sleep(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function sanitizeProviderMessage(value) {
  return String(value || "").replace(/sk-[A-Za-z0-9*_-]+/g, "sk-***");
}

export function providerHttpError(label, response, data) {
  const error = new Error(
    sanitizeProviderMessage(
      `${label} failed ${response.status}: ${data?.error?.message || data?.message || String(data || "").slice(0, 500)}`,
    ),
  );
  error.status = response.status;
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    error.retryAfterMs = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1000)
      : Math.max(0, Date.parse(retryAfter) - Date.now());
  }
  return error;
}

export function isTransientFetchError(error) {
  return (
    !error?.status &&
    /fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(
      String(error?.message || error),
    )
  );
}

export function createProviderHttp({
  fetchImpl = globalThis.fetch.bind(globalThis),
  retryBaseMs = 1000,
  maxRetryDelayMs = 60_000,
} = {}) {
  async function providerJson(url, options, label, signal) {
    const response = await fetchImpl(url, { ...options, signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerHttpError(label, response, data);
    return data;
  }

  async function providerPollJson(url, options, label, signal) {
    let delay = retryBaseMs;
    while (true) {
      try {
        return await providerJson(url, options, label, signal);
      } catch (error) {
        if (error?.status !== 429) throw error;
        await sleep(Math.min(maxRetryDelayMs, Math.max(delay, error.retryAfterMs || 0)), signal);
        delay = Math.min(maxRetryDelayMs, delay * 2);
      }
    }
  }

  return { fetchImpl, providerJson, providerPollJson };
}
