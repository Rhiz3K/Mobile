import {
  checkNeeds,
  originInputs,
  planConnection,
  planFor,
  type ConnectionOrigin,
  type ConnectionPlan,
  type NeedsResult,
} from "@/core/transport";
import { features } from "./registry";

export interface OpenCheck extends NeedsResult {
  plan: ConnectionPlan;
}

/**
 * How a tab of `type` would connect this host, narrowed to what the tab
 * needs. `blocked` says why it can't and which origin would work.
 */
export async function checkOpen(
  accountId: string | null,
  host: { id: number; connectFrom?: string },
  isSsh: boolean,
  type: string,
  origin?: ConnectionOrigin,
): Promise<OpenCheck> {
  const plan = await planFor(accountId, host, isSsh, origin);
  const inputs = originInputs(accountId, isSsh);
  const title = features.sessionFeature(type)?.title ?? "This";
  const result = checkNeeds(features.sessionNeeds(type), plan, title, (o) =>
    planConnection(o, inputs),
  );
  return { ...result, plan };
}
