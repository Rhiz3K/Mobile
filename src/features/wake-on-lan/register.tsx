import { Zap } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import { toast } from "@/utils/toast";

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
          await ctx.client?.api.wakeOnLan.wakeHost(host.id);
          toast.success(`Wake-on-LAN sent to ${host.name}`);
        } catch {
          toast.error("Failed to send Wake-on-LAN packet");
        }
      },
    },
  ],
  capabilities: ["host.wake"],
};
