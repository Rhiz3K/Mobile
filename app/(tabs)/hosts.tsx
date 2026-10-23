import Hosts from "@/screens/hosts/Hosts";
import { Screen } from "@/components/Screen";
import { ConnectEmptyState } from "@/components/ConnectEmptyState";
import { useAppContext } from "@/contexts/AppContext";

export default function HostsScreen() {
  const { isAuthenticated } = useAppContext();

  if (!isAuthenticated) {
    return (
      <Screen title="Hosts">
        <ConnectEmptyState />
      </Screen>
    );
  }

  return <Hosts />;
}
