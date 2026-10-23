import { useCallback, useSyncExternalStore } from "react";
import {
  hasFeature,
  refreshEnabledPlugins,
  subscribeServerFeatures,
} from "@/core/api/main-axios";
import type { ServerFeature } from "@/core/api/compat/server-features";

let version = 0;
const getVersion = () => version;
subscribeServerFeatures(() => {
  version += 1;
});

/** Which plugin features the connected server has turned on. */
export function useServerFeatures() {
  const current = useSyncExternalStore(
    subscribeServerFeatures,
    getVersion,
    getVersion,
  );
  const has = useCallback(
    (feature: ServerFeature) => hasFeature(feature),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );
  return { has, refresh: refreshEnabledPlugins };
}
