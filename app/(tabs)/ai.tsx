import { useEffect, useRef } from "react";
import { useIsFocused, useLocalSearchParams, useNavigation } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useFeatureAvailable, useFeatureContext } from "@/core/features";
import { aiOrigin } from "@/features/ai/navigation";
import AiAssistant from "@/screens/settings/AiAssistant";

export default function AiTab() {
  const navigation = useNavigation<BottomTabBarProps["navigation"]>();
  const focused = useIsFocused();
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const origin = aiOrigin(from);
  const { account } = useFeatureContext();
  const available = useFeatureAvailable("ai");
  const previous = useRef({ accountId: account.id, available });

  useEffect(() => {
    const before = previous.current;
    previous.current = { accountId: account.id, available };
    if (
      focused &&
      before.accountId === account.id &&
      before.available &&
      !available
    ) {
      navigation.navigate(origin);
    }
  }, [account.id, available, focused, navigation, origin]);

  return <AiAssistant mode="tab" />;
}
