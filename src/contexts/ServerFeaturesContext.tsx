import { useCallback } from "react";
import type { ServerFeature } from "@/core/api/compat/server-features";
import { useActiveClient } from "@/core/accounts";

/** Which plugin features the active server has turned on. */
export function useServerFeatures() {
  const client = useActiveClient();
  const version = client?.version;
  const has = useCallback(
    (feature: ServerFeature) => client?.hasFeature(feature) ?? false,
    // The client mutates in place, so its version is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, version],
  );
  const refresh = useCallback(
    () => client?.refreshEnabledPlugins() ?? Promise.resolve(),
    [client],
  );
  return { has, refresh };
}
