import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyConfig, KeyCategory } from "@/types/keyboard";
import { ALL_KEYS } from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";
import {
  Text,
  Button,
  Input,
  InlineView,
  Tabs,
  ListRow,
  EmptyState,
} from "@/app/components/ui";

interface KeySelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectKey: (key: KeyConfig) => void;
  excludeKeys?: string[];
  title?: string;
}

const CATEGORIES: { id: KeyCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "modifier", label: "Modifiers" },
  { id: "arrow", label: "Arrows" },
  { id: "navigation", label: "Navigation" },
  { id: "function", label: "Function" },
  { id: "number", label: "Numbers" },
  { id: "symbol", label: "Symbols" },
  { id: "operator", label: "Operators" },
  { id: "punctuation", label: "Punctuation" },
  { id: "action", label: "Actions" },
  { id: "shortcut", label: "Shortcuts" },
];

export default function KeySelector({
  visible,
  onClose,
  onSelectKey,
  excludeKeys = [],
  title = "Add Key",
}: KeySelectorProps) {
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<KeyCategory | "all">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const allKeysArray = useMemo(() => Object.values(ALL_KEYS), []);

  const filteredKeys = useMemo(() => {
    let keys = allKeysArray;

    if (selectedCategory !== "all") {
      keys = keys.filter((key) => key.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      keys = keys.filter(
        (key) =>
          key.label.toLowerCase().includes(query) ||
          key.id.toLowerCase().includes(query) ||
          key.description?.toLowerCase().includes(query),
      );
    }

    return keys.filter((key) => !excludeKeys.includes(key.id));
  }, [allKeysArray, selectedCategory, searchQuery, excludeKeys]);

  return (
    <InlineView
      open={visible}
      onClose={onClose}
      title={title}
      scroll={false}
      bare
    >
      <View className="border-b border-border px-3 py-2.5">
        <Input
          placeholder="Search keys"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Tabs
        options={CATEGORIES}
        value={selectedCategory}
        onChange={setSelectedCategory}
        fill={false}
        size="sm"
      />
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      >
        {filteredKeys.length === 0 ? (
          <EmptyState
            title={
              searchQuery ? "No keys match your search" : "No keys available"
            }
          />
        ) : (
          filteredKeys.map((key, i) => (
            <ListRow
              key={key.id}
              index={i}
              onPress={() => onSelectKey(key)}
              title={
                <View className="shrink-0 border border-border bg-muted px-2 py-1">
                  <Text weight="medium" className="text-xs text-foreground">
                    {key.label}
                  </Text>
                </View>
              }
              badges={
                <Text className="text-2xs text-muted-foreground">
                  {key.category}
                </Text>
              }
              meta={key.description}
              trailing={
                <Button
                  variant="default"
                  size="sm"
                  onPress={() => onSelectKey(key)}
                >
                  Add
                </Button>
              }
            />
          ))
        )}
      </ScrollView>
    </InlineView>
  );
}
