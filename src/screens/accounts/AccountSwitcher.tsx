import { View } from "react-native";
import { Plus, Server, Smartphone, Trash2 } from "lucide-react-native";
import { Button, Sheet, SheetRow, Text, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useAppContext } from "@/contexts/AppContext";
import {
  accountLabel,
  accounts,
  useAccounts,
  type Account,
} from "@/core/accounts";
import { toUserMessage } from "@/core/errors";
import { toast } from "@/utils/toast";

const STATUS: Record<string, string> = {
  idle: "Signed in",
  syncing: "Syncing",
  offline: "Offline",
  error: "Error",
  signed_out: "Signed out",
};

function details(account: Account): string {
  if (account.kind === "local") return "Works without a server";
  const parts = [
    account.username,
    account.serverUrl.replace(/^https?:\/\//, ""),
    STATUS[account.status],
  ];
  return parts.filter(Boolean).join(" | ");
}

/** Lists This device and every linked server; tap one to switch to it. */
export function AccountSwitcher() {
  const color = useThemeColor();
  const confirm = useConfirm();
  const { accounts: list, active } = useAccounts();
  const { accountSwitcherVisible, closeAccountSwitcher, openAuthFlow } =
    useAppContext();
  const iconColor = color("foreground") ?? "#fafafa";

  const switchTo = async (account: Account) => {
    closeAccountSwitcher();
    if (account.id === active.id) return;
    try {
      await accounts.setActive(account.id);
    } catch (e) {
      toast.error(toUserMessage(e, "Could not switch account"));
    }
  };

  const remove = async (account: Account) => {
    const ok = await confirm({
      title: `Remove ${accountLabel(account)}?`,
      description:
        "This removes the server and its saved sign in from this phone. Nothing is deleted on the server.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await accounts.remove(account.id);
    } catch (e) {
      toast.error(toUserMessage(e, "Could not remove account"));
    }
  };

  const linkServer = () => {
    closeAccountSwitcher();
    openAuthFlow("server");
  };

  return (
    <Sheet
      visible={accountSwitcherVisible}
      onClose={closeAccountSwitcher}
      title="Accounts"
      description="Open tabs keep running when you switch."
    >
      {list.map((account) => {
        const Icon = account.kind === "local" ? Smartphone : Server;
        const isActive = account.id === active.id;
        return (
          <SheetRow
            key={account.id}
            icon={<Icon size={18} color={iconColor} />}
            label={accountLabel(account)}
            description={details(account)}
            selected={isActive}
            onPress={() => switchTo(account)}
            trailing={
              account.kind === "server" && !isActive ? (
                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel={`Remove ${accountLabel(account)}`}
                  onPress={() => remove(account)}
                  icon={<Trash2 size={16} color={color("muted-foreground")} />}
                />
              ) : null
            }
          />
        );
      })}
      <SheetRow
        icon={<Plus size={18} color={iconColor} />}
        label="Link a server"
        onPress={linkServer}
      />
      <View className="px-4 py-3">
        <Text className="text-[11px] text-muted-foreground">
          Each server keeps its own hosts, logins and settings on this phone.
        </Text>
      </View>
    </Sheet>
  );
}
