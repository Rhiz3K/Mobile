import { createServicesApi } from "@/core/api/modules/services";
import { createRelayServicesBackend } from "@/features/services/backend/relay";

function client() {
  const get = jest.fn(async (path: string, config: any) => ({
    data: path.endsWith("/status")
      ? { init: "systemd", canEdit: false, readOnly: false }
      : path.endsWith("/journal")
        ? { entries: [{ message: "x" }], truncated: false, config }
        : [],
  }));
  const post = jest.fn(async () => ({ data: { state: "active", output: "" } }));
  const c: any = {
    http: { auth: { get, post } },
    rootBase: () => "https://t.example",
    fail: (e: unknown) => {
      throw e;
    },
  };
  c.api = { services: createServicesApi(c) };
  return { c, get, post };
}

test("calls the plugin routes by host id", async () => {
  const { c, get, post } = client();
  const backend = createRelayServicesBackend(c, {
    id: 42,
    ip: "1.2.3.4",
  } as any);
  expect(await backend.status()).toMatchObject({
    init: "systemd",
    readOnly: true,
  });
  await backend.units("timer");
  await backend.unit("a@b.service");
  expect(await backend.action("nginx.service", "restart")).toBe("active");
  expect(
    await backend.journal({ units: ["a.service"], priority: 3, lines: 10 }),
  ).toEqual([{ message: "x" }]);
  expect(get.mock.calls.map((x) => x[0])).toEqual([
    "/plugin-api/service-manager/42/status",
    "/plugin-api/service-manager/42/units",
    "/plugin-api/service-manager/42/units/a%40b.service",
    "/plugin-api/service-manager/42/journal",
  ]);
  expect(get.mock.calls[1][1].params).toEqual({ type: "timer" });
  expect(get.mock.calls[3][1].params).toEqual({
    unit: ["a.service"],
    priority: 3,
    lines: 10,
  });
  expect(post.mock.calls[0][0]).toBe(
    "/plugin-api/service-manager/42/units/nginx.service/actions/restart",
  );
});
