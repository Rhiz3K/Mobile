import { View } from "react-native";
import Hosts from "@/screens/hosts/Hosts";

export const HOSTS_PANE_WIDTH = 340;

/** The host list beside the terminal on wide windows. */
export function HostsPane() {
  return (
    <View
      className="border-r border-border bg-background"
      style={{ width: HOSTS_PANE_WIDTH }}
    >
      <Hosts />
    </View>
  );
}
