import { View } from "react-native";
import { ServerOff } from "lucide-react-native";
import { Button, EmptyState } from "@/app/components/ui";
import { useAppContext } from "@/app/AppContext";

/**
 * Shown inside a tab when there is no authenticated server connection. Prompts
 * the user to connect, opening the auth flow. Used across Hosts / Sessions so
 * the disconnected state is consistent.
 */
export function ConnectEmptyState({
  title = "No server connected",
  message = "Connect to a Termix server to manage your hosts, terminals, files and more.",
}: {
  title?: string;
  message?: string;
}) {
  const { hasServerConfigured, openAuthFlow } = useAppContext();

  return (
    <View className="flex-1 justify-center">
      <EmptyState
        icon={ServerOff}
        title={title}
        hint={message}
        action={
          <Button
            size="lg"
            className="min-w-48"
            onPress={() =>
              openAuthFlow(hasServerConfigured ? "login" : "server")
            }
          >
            {hasServerConfigured ? "Sign in" : "Add server"}
          </Button>
        }
      />
    </View>
  );
}
