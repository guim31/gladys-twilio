// -----------------------------------------------------------------------------
// The one place that touches the network: an HTTPS request to the Twilio REST
// API through the global fetch, with a timeout. The tests replace it with the
// fake Twilio of test/helpers/fakeTwilio.js (the `request` seam).
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * @param {{ method: string, url: string, headers: object, body?: string, timeoutMs?: number }} options
 * @returns {Promise<{ status: number, headers: object, body: string }>}
 * @throws {Error} with `network: true` when no HTTP answer came back
 */
export async function httpRequest({ method, url, headers, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    // The cause carries the useful part (ENOTFOUND, ECONNREFUSED...), never the
    // Authorization header.
    const reason = timedOut ? 'timeout' : (err?.cause?.code ?? err?.message ?? 'network error');
    const error = new Error(reason);
    error.network = true;
    throw error;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}
