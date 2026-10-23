import { useState, useEffect } from "react";
import { View, TextInput, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Save, RotateCcw, FileText } from "lucide-react-native";
import { InlineView, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { toast } from "@/utils/toast";

interface FileViewerProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

export function FileViewer({
  visible,
  onClose,
  fileName,
  filePath,
  initialContent,
  onSave,
  readOnly = false,
}: FileViewerProps) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const confirm = useConfirm();
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent, visible]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== initialContent);
  };

  const handleSave = async () => {
    if (!hasChanges || readOnly) return;
    try {
      setIsSaving(true);
      await onSave(content);
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!hasChanges) return;
    const ok = await confirm({
      title: "Revert changes?",
      description: "Your edits since the last save will be lost.",
      confirmLabel: "Revert",
    });
    if (!ok) return;
    setContent(initialContent);
    setHasChanges(false);
  };

  // Unsaved edits ask before the view closes. Save stays in the header.
  const confirmClose = async () => {
    if (!hasChanges || readOnly) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "Save first if you want to keep them.",
      confirmLabel: "Discard",
    });
  };

  return (
    <InlineView
      open={visible}
      onClose={onClose}
      onBeforeClose={confirmClose}
      safeTop={false}
      scroll={false}
      bare
      title={fileName}
      subtitle={readOnly ? `${filePath} | Read only` : filePath}
      icon={<FileText size={16} color={color("muted-foreground")} />}
      actions={
        !readOnly && hasChanges ? (
          <>
            <Pressable
              onPress={handleRevert}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Revert changes"
              className="h-9 w-9 items-center justify-center border border-border active:bg-muted"
            >
              <RotateCcw size={16} color={color("muted-foreground")} />
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Save"
              className="h-9 w-9 items-center justify-center border border-accent-brand/40 bg-accent-brand/15 active:bg-accent-brand/25"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={color("accent-brand")} />
              ) : (
                <Save size={16} color={color("accent-brand")} />
              )}
            </Pressable>
          </>
        ) : null
      }
    >
      <View className="flex-1">
        <TextInput
          className="flex-1 bg-background text-foreground"
          value={content}
          onChangeText={handleContentChange}
          multiline
          editable={!readOnly}
          scrollEnabled
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{
            fontFamily: MONO_FONT,
            fontSize: 13,
            lineHeight: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, 12),
            paddingRight: Math.max(insets.right, 12),
            textAlignVertical: "top",
            color: color("foreground"),
          }}
          placeholder={readOnly ? "File content" : "Enter file content"}
          placeholderTextColor={color("muted-foreground", 0.5)}
        />
      </View>
    </InlineView>
  );
}
