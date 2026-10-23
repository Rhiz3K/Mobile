import {
  DEFAULT_FILTERS,
  applyFilters,
  buildHostTree,
} from "@/screens/hosts/navigation/hostTree";
import type { SSHHost } from "@/types";

const host = (id: number, extra: Partial<SSHHost>) =>
  ({ id, name: `h${id}`, ip: `10.0.0.${id}`, folder: "", ...extra }) as SSHHost;

const hosts = [
  host(1, {}),
  host(2, { enableSsh: false, enableRdp: true }),
  host(3, { enableDocker: true }),
];
const ids = (nodes: any[]): number[] =>
  nodes.flatMap((n) => (n.kind === "host" ? [n.host.id] : ids(n.children)));

test("ssh is a built in filter, others come from matchers", () => {
  const tree = buildHostTree(hosts);
  const status = () => "online" as const;
  expect(
    ids(applyFilters(tree, { ...DEFAULT_FILTERS, protocol: ["ssh"] }, status)),
  ).toEqual([1, 3]);
  const matchers = {
    rdp: (h: SSHHost) => !!h.enableRdp,
    docker: (h: SSHHost) => !!h.enableDocker,
  };
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, protocol: ["rdp"] },
        status,
        matchers,
      ),
    ),
  ).toEqual([2]);
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, features: ["docker"] },
        status,
        matchers,
      ),
    ),
  ).toEqual([3]);
});

test("a saved filter for a feature that is gone matches nothing", () => {
  const tree = buildHostTree(hosts);
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, features: ["gone"] },
        () => "online",
      ),
    ),
  ).toEqual([]);
});
