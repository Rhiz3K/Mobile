import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

async function client(generation: "plugin" | "legacy" = "plugin") {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example/base/",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", generation);
  await c.load();
  await c.setToken("tok");
  return c;
}

function fakeFetch(reply: { status?: number; json?: unknown }) {
  const calls: { url: string; init: any }[] = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => reply.json ?? {},
    } as Response;
  }) as any;
  return calls;
}

test("stream downloads post to the plugin route with Range when resuming", async () => {
  const c = await client();
  const calls = fakeFetch({ status: 206 });
  await c.api.files.downloadStream("sid", "/var/log/a", 100);
  expect(calls[0].url).toBe(
    "https://termix.example/base/plugin-api/file-manager/downloadFileStream",
  );
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers.Range).toBe("bytes=100-");
  expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
  expect(JSON.parse(calls[0].init.body)).toEqual({
    sessionId: "sid",
    path: "/var/log/a",
  });
  await c.api.files.downloadStream("sid", "/a", 0);
  expect(calls[1].init.headers.Range).toBeUndefined();
});

test("older servers get the legacy stream path", async () => {
  const c = await client("legacy");
  expect(c.api.files.streamUrl("uploadFileChunk")).toBe(
    "https://termix.example/base/ssh/file_manager/ssh/uploadFileChunk",
  );
});

test("chunks go as raw bytes with their offset", async () => {
  const c = await client();
  const calls = fakeFetch({ json: { nextOffset: 7, complete: true } });
  const bytes = new Uint8Array([1, 2, 3]);
  const next = await c.api.files.uploadChunk("sid", "/srv", "a b", 4, 7, bytes);
  expect(next).toEqual({ nextOffset: 7, complete: true });
  const url = new URL(calls[0].url);
  expect(url.pathname).toBe("/base/plugin-api/file-manager/uploadFileChunk");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    sessionId: "sid",
    path: "/srv",
    fileName: "a b",
    offset: "4",
    totalSize: "7",
  });
  expect(calls[0].init.body).toBe(bytes);
  expect(calls[0].init.headers["Content-Type"]).toBe(
    "application/octet-stream",
  );
});

test("a failed stream throws the server's message", async () => {
  const c = await client();
  fakeFetch({ status: 400, json: { error: "Cannot download directories" } });
  await expect(c.api.files.downloadStream("sid", "/d", 0)).rejects.toThrow(
    "Cannot download directories",
  );
});
