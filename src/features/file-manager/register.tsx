import { forwardRef } from "react";
import { Folder, FolderSearch } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost } from "@/utils/hosts";
import { FileManager, type FileManagerHandle } from "./FileManager";

const FilesTab = forwardRef<FileManagerHandle, SessionTabProps>(
  ({ session, isVisible }, ref) => (
    <FileManager
      ref={ref}
      host={session.host}
      sessionId={session.id}
      isVisible={isVisible}
    />
  ),
);
FilesTab.displayName = "FilesTab";

export const fileManagerFeature: FeatureDef = {
  id: "file-manager",
  title: "File Manager",
  source: "native",
  requires: { plugin: "file-manager" },
  sessionTabs: [
    {
      type: "filemanager",
      icon: Folder,
      titleSuffix: () => "Files",
      shortLabel: () => "Files",
      serverTabTypes: ["files", "sftp"],
      toServerTabType: () => "files",
      capabilities: ["keyboard-cover"],
      component: FilesTab,
    },
  ],
  hostActions: [
    {
      id: "file-manager.open",
      label: "File Manager",
      icon: FolderSearch,
      group: "connect",
      order: 20,
      isAvailable: (host) => isSshHost(host) && !!host.enableFileManager,
      run: (_host, ctx) => ctx.openSession("filemanager"),
    },
  ],
  hostToggles: [
    {
      key: "enableFileManager",
      label: "File Manager",
      group: "feature",
      order: 20,
    },
  ],
  hostBadges: [
    {
      label: "FILES",
      order: 30,
      show: (host, ssh) => ssh && !!host.enableFileManager,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "fileManager",
      label: "File Manager",
      order: 20,
      matches: (host) => !!host.enableFileManager,
    },
  ],
  capabilities: ["files.defaultPath"],
};
