import { Tabs, usePathname } from "expo-router";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { BottomBar, TABS } from "@/screens/shell/BottomBar";

export default function TabLayout() {
  const { sessions } = useTerminalSessions();
  const pathname = usePathname();

  // Hide the main tab bar when viewing a full-screen session.
  const hideTabBar = pathname === "/sessions" && sessions.length > 0;

  return (
    <Tabs
      tabBar={hideTabBar ? () => null : (props) => <BottomBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.label }}
        />
      ))}
      <Tabs.Screen name="ai" options={{ title: "AI Assistant" }} />
    </Tabs>
  );
}
