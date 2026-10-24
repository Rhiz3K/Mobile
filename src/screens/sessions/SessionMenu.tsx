import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CopyPlus,
  Pencil,
  X,
} from "lucide-react-native";
import { PromptSheet, Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { accounts, useClient } from "@/core/accounts";
import { features } from "@/core/features";
import type {
  SessionMenuContext,
  SessionMenuItemDef,
} from "@/core/features/types";
import { displayTitle } from "@/contexts/session-tabs";
import type { TerminalSession } from "@/contexts/TerminalSessionsContext";

/**
 * A tab's menu: rename, another tab on the host, move, close, and whatever
 * the tab's features add, like find or a share link.
 */
export function SessionMenu({
  session,
  index,
  count,
  handle,
  onClose,
  onRename,
  onDuplicate,
  onMove,
  onCloseTab,
  onView,
}: {
  session: TerminalSession | null;
  index: number;
  count: number;
  handle: SessionMenuContext["handle"];
  onClose: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
  onMove: (toIndex: number) => void;
  onCloseTab: () => void;
  /** A feature item asked to show its view. */
  onView: (item: SessionMenuItemDef, ctx: SessionMenuContext) => void;
}) {
  const color = useThemeColor();
  const client = useClient(session?.accountId ?? null);
  const [renaming, setRenaming] = useState(false);

  const ctx = useMemo<SessionMenuContext | null>(() => {
    if (!session) return null;
    return {
      account: accounts.find(session.accountId) ?? accounts.active(),
      client,
      session,
      handle,
      transport: session.transport ?? null,
    };
  }, [session, client, handle]);
  const items = useMemo(
    () => (ctx ? features.sessionMenuItems(ctx) : []),
    [ctx],
  );

  const icon = (Icon: typeof Pencil) => (
    <Icon size={16} color={color("foreground")} />
  );
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <Sheet
        visible={session !== null && !renaming}
        onClose={onClose}
        title={session ? displayTitle(session) : undefined}
        scroll
      >
        <SheetRow
          icon={icon(Pencil)}
          label="Rename"
          onPress={() => setRenaming(true)}
        />
        <SheetRow
          icon={icon(CopyPlus)}
          label="New tab on this host"
          onPress={pick(onDuplicate)}
        />
        {items.map((item) => (
          <SheetRow
            key={item.id}
            icon={icon(item.icon as typeof Pencil)}
            label={item.label}
            onPress={pick(() => {
              if (!ctx) return;
              if (item.view) onView(item, ctx);
              else item.run?.(ctx);
            })}
          />
        ))}
        {index > 0 ? (
          <SheetRow
            icon={icon(ArrowLeft)}
            label="Move left"
            onPress={pick(() => onMove(index - 1))}
          />
        ) : null}
        {index < count - 1 ? (
          <SheetRow
            icon={icon(ArrowRight)}
            label="Move right"
            onPress={pick(() => onMove(index + 1))}
          />
        ) : null}
        <SheetRow
          icon={<X size={16} color={color("destructive")} />}
          label="Close tab"
          destructive
          onPress={pick(onCloseTab)}
        />
      </Sheet>
      <PromptSheet
        visible={renaming}
        title="Rename tab"
        description="Leave it empty to use the host's name."
        defaultValue={session?.customTitle ?? ""}
        placeholder={session?.title}
        validate={() => true}
        onCancel={() => setRenaming(false)}
        onSubmit={(value) => {
          setRenaming(false);
          onClose();
          onRename(value);
        }}
      />
    </>
  );
}
