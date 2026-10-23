import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { nativeRequest, type NetResponse } from "@/modules/termix-net";

function bodyOf(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (
    (typeof FormData !== "undefined" && data instanceof FormData) ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data)
  ) {
    throw new AxiosError(
      "This request can't go through a client certificate connection yet.",
      "ERR_NOT_SUPPORT",
    );
  }
  return JSON.stringify(data);
}

function flatHeaders(
  config: InternalAxiosRequestConfig,
): Record<string, string> {
  const out: Record<string, string> = {};
  const json = AxiosHeaders.from(config.headers).toJSON();
  for (const [name, value] of Object.entries(json)) {
    if (value === undefined || value === null) continue;
    out[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

/**
 * Sends axios requests through the termix-net module, which presents the
 * account's client certificate. Only used on iOS, where React Native's own
 * networking can't.
 */
export const nativeAdapter: AxiosAdapter = async (config) => {
  const url = axios.getUri(config);
  let response: NetResponse;
  try {
    response = await nativeRequest({
      url,
      method: (config.method ?? "get").toUpperCase(),
      headers: flatHeaders(config),
      body: bodyOf(config.data),
      timeoutMs: config.timeout || 30000,
    });
  } catch (error) {
    if (error instanceof AxiosError) throw error;
    throw new AxiosError(
      error instanceof Error ? error.message : "Network Error",
      AxiosError.ERR_NETWORK,
      config,
    );
  }
  const result: AxiosResponse = {
    data: response.body,
    status: response.status,
    statusText: "",
    headers: new AxiosHeaders(response.headers),
    config,
    request: { responseURL: response.url },
  };
  const valid = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
  if (!response.status || valid(response.status)) return result;
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    response.status >= 500
      ? AxiosError.ERR_BAD_RESPONSE
      : AxiosError.ERR_BAD_REQUEST,
    config,
    result.request,
    result,
  );
};

/** A fetch Response built from a native response, for code that uses fetch. */
export function toFetchResponse(response: NetResponse): Response {
  const headers = new Headers(response.headers);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: "",
    url: response.url,
    headers,
    redirected: false,
    type: "basic",
    bodyUsed: false,
    body: null,
    text: async () => response.body,
    json: async () => JSON.parse(response.body),
    clone() {
      return toFetchResponse(response);
    },
  } as unknown as Response;
}
