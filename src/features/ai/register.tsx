import { Sparkles } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";

export const aiFeature: FeatureDef = {
  id: "ai",
  plugins: ["ai"],
  title: "AI Assistant",
  source: "native",
  requires: { plugin: "ai", pluginApiOnly: true },
  tools: [
    {
      id: "ai",
      label: "AI Assistant",
      description: "Chat with your server's AI assistant",
      icon: Sparkles,
      order: 25,
      href: "/(tabs)/ai?from=tools",
    },
  ],
  settingsLinks: [
    {
      id: "ai",
      label: "AI Assistant",
      icon: Sparkles,
      order: 15,
      href: "/(tabs)/ai?from=settings",
    },
  ],
};
