import { Redirect } from "expo-router";

import DisplayLab from "@/screens/dev/display-lab/DisplayLab";
import { labEnabled } from "@/screens/dev/terminal-lab/enabled";

export default function DisplayLabRoute() {
  if (!labEnabled()) return <Redirect href="/(tabs)/hosts" />;
  return <DisplayLab />;
}
