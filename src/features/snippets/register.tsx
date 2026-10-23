import { FileText } from "lucide-react-native";
import type { FeatureDef } from "@/core/features/types";
import SnippetsBar from "@/features/terminal/keyboard/SnippetsBar";

export const snippetsFeature: FeatureDef = {
  id: "snippets",
  title: "Snippets",
  source: "native",
  requires: { plugin: "snippets" },
  keyboardTabs: [
    { id: "snippets", label: "SNIPPETS", order: 10, component: SnippetsBar },
  ],
  settingsLinks: [
    {
      id: "snippets",
      label: "Snippets",
      icon: FileText,
      order: 40,
      href: "/tabs/settings/Snippets",
    },
  ],
  capabilities: ["widgets.snippets"],
};
