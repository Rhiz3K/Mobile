import { AppError } from "@/core/errors";
import type { Transport } from "./types";

const REASON =
  "This device can't connect to hosts yet. Link a Termix server to connect.";

/** The phone opening SSH itself. Waits for the native SSH module. */
export const localTransport: Transport = {
  kind: "local",
  available: false,
  unavailableReason: REASON,
  openShell() {
    throw new AppError(REASON, "TRANSPORT_UNAVAILABLE");
  },
};
