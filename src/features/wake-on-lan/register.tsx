import { Zap } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { toast } from "@/utils/toast";
import { serverHostId } from "@/core/sync";

export const wakeOnLanFeature: FeatureDef = {
  id: "wake-on-lan",
  title: "Wake on LAN",
  source: "native",
  requires: { plugin: "wake-on-lan" },
  hostActions: [
    {
      id: "wake-on-lan.wake",
      label: "Wake on LAN",
      icon: Zap,
      group: "manage",
      order: 10,
      isAvailable: (host) => !!host.macAddress,
      run: async (host, ctx) => {
        ctx.close();
        try {
          const client = ctx.client;
          if (!client) return;
          await client.api.wakeOnLan.wakeHost(
            await serverHostId(client.accountId, host),
          );
          toast.success(`Wake-on-LAN sent to ${host.name}`);
        } catch {
          toast.error("Failed to send Wake-on-LAN packet");
        }
      },
    },
  ],
  capabilities: ["host.wake"],
};
