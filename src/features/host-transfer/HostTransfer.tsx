import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useRepositories } from "@/core/data/hooks";
import { importSummary, type ImportResult } from "@/core/hosts/transfer/import";
import { buildExport, withJumpHosts } from "@/core/hosts/transfer/termix-json";
import type { SSHHost } from "@/types";
import { readLocalText } from "@/utils/localFile";
import { toast } from "@/utils/toast";
import {
  Button,
  Checkbox,
  FakeSwitch,
  Sheet,
  SettingRow,
  Text,
  useConfirm,
} from "@/ui";
import {
  describeSource,
  readImportText,
  runImport,
  type ImportSource,
} from "./read";
import { ScanSheet } from "./ScanSheet";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="border border-border bg-card">
      <View className="border-b border-border px-3 py-3">
        <Text
          weight="bold"
          className="text-[11px] uppercase tracking-[2px] text-foreground"
        >
          {title}
        </Text>
      </View>
      <View className="gap-2 px-3 py-3">{children}</View>
    </View>
  );
}

export default function HostTransfer() {
  const router = useRouter();
  const color = useThemeColor();
  const repos = useRepositories();
  const confirm = useConfirm();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [everything, setEverything] = useState(true);
  const [secrets, setSecrets] = useState(false);

  const load = useCallback(async () => {
    setHosts(
      (await repos.hosts.list().catch(() => [])).filter((h) => !h.shared),
    );
  }, [repos]);

  useEffect(() => {
    void load();
    return repos.hosts.subscribe(() => void load());
  }, [load, repos]);

  const read = (text: string) => {
    try {
      setSource(readImportText(text));
      setResult(null);
    } catch (e: any) {
      setSource(null);
      toast.error(e?.message || "Could not read that");
    }
  };

  const chooseFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/json", "text/plain", "*/*"],
      });
      if (res.canceled || !res.assets?.[0]) return;
      read(await readLocalText(res.assets[0].uri));
    } catch {
      toast.error("Could not read that file");
    }
  };

  const paste = async () => {
    read(await Clipboard.getStringAsync());
  };

  const doImport = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const res = await runImport(repos, source, { overwrite });
      setResult(res);
      setSource(null);
      if (res.created + res.updated > 0) toast.success(importSummary(res));
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const chosen = useMemo(() => {
    const all = everything ? hosts : hosts.filter((h) => picked.has(h.id));
    return withJumpHosts(all, hosts);
  }, [everything, hosts, picked]);

  const makeExport = async () => {
    if (secrets) {
      const ok = await confirm({
        title: "Include passwords and keys?",
        description:
          "Anyone who gets this file can sign in to these hosts. Keep it safe.",
        confirmLabel: "Include them",
      });
      if (!ok) return null;
    }
    const logins = await repos.credentials.list().catch(() => []);
    return JSON.stringify(
      buildExport(chosen, logins, { share: !secrets }),
      null,
      2,
    );
  };

  const shareFile = async () => {
    if (chosen.length === 0) return toast.error("Pick at least one host");
    setBusy(true);
    try {
      const content = await makeExport();
      if (!content) return;
      const day = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `termix-hosts-${day}.json`);
      file.create({ overwrite: true });
      file.write(content);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Save your Termix hosts",
      });
      try {
        file.delete();
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || "Could not make the file");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (chosen.length === 0) return toast.error("Pick at least one host");
    const content = await makeExport();
    if (!content) return;
    await Clipboard.setStringAsync(content);
    toast.success("Copied to the clipboard");
  };

  return (
    <Screen
      title="Import and export"
      subtitle="Move hosts in and out"
      headerLeft={
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section title="Import">
          <Text className="text-meta text-muted-foreground">
            A Termix host file, an SSH config file, or a host link or QR code
            from another phone.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button variant="muted" size="sm" onPress={() => void chooseFile()}>
              Choose a file
            </Button>
            <Button variant="muted" size="sm" onPress={() => void paste()}>
              Paste
            </Button>
            <Button variant="muted" size="sm" onPress={() => setScanning(true)}>
              Scan a code
            </Button>
          </View>
          {source ? (
            <View className="gap-2 border border-border bg-muted/30 p-3">
              <Text weight="medium" className="text-row text-foreground">
                {describeSource(source)}
              </Text>
              {source.kind !== "link" && source.file.errors.length > 0 ? (
                <Text className="text-meta text-warning">
                  {source.file.errors.length} could not be read
                </Text>
              ) : null}
              <SettingRow
                label="Update hosts that exist"
                description="Same address, port and user. Otherwise they are skipped"
                last
              >
                <FakeSwitch
                  checked={overwrite}
                  onChange={setOverwrite}
                  accessibilityLabel="Update hosts that exist"
                />
              </SettingRow>
              <View className="flex-row justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setSource(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onPress={() => void doImport()}
                >
                  Import
                </Button>
              </View>
            </View>
          ) : null}
          {result ? (
            <View className="gap-1 border border-border p-3">
              <Text weight="medium" className="text-row text-foreground">
                {importSummary(result)}
              </Text>
              {result.errors.slice(0, 8).map((error, i) => (
                <Text key={i} className="text-meta text-muted-foreground">
                  {error}
                </Text>
              ))}
              {result.errors.length > 8 ? (
                <Text className="text-meta text-muted-foreground">
                  and {result.errors.length - 8} more
                </Text>
              ) : null}
            </View>
          ) : null}
        </Section>

        <Section title="Export">
          <SettingRow
            label="All hosts"
            description={
              everything
                ? `${hosts.length} ${hosts.length === 1 ? "host" : "hosts"}`
                : `${picked.size} picked`
            }
          >
            <FakeSwitch
              checked={everything}
              onChange={setEverything}
              accessibilityLabel="All hosts"
            />
          </SettingRow>
          {!everything ? (
            <Button variant="muted" size="sm" onPress={() => setPicking(true)}>
              Pick hosts
            </Button>
          ) : null}
          <SettingRow
            label="Include passwords and keys"
            description="Off makes a file safe to share. Hosts that use a saved login point at it by name"
            last
          >
            <FakeSwitch
              checked={secrets}
              onChange={setSecrets}
              accessibilityLabel="Include passwords and keys"
            />
          </SettingRow>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" disabled={busy} onPress={() => void shareFile()}>
              Share a file
            </Button>
            <Button
              variant="muted"
              size="sm"
              disabled={busy}
              onPress={() => void copy()}
            >
              Copy
            </Button>
          </View>
        </Section>
      </ScrollView>

      <ScanSheet
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(text) => {
          setScanning(false);
          read(text);
        }}
      />
      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Pick hosts"
        scroll
      >
        {hosts.map((h) => (
          <Pressable
            key={h.id}
            onPress={() =>
              setPicked((prev) => {
                const next = new Set(prev);
                if (next.has(h.id)) next.delete(h.id);
                else next.add(h.id);
                return next;
              })
            }
            className="min-h-12 flex-row items-center gap-3 border-b border-border/40 px-4 py-3"
          >
            <Checkbox
              checked={picked.has(h.id)}
              onChange={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(h.id)) next.delete(h.id);
                  else next.add(h.id);
                  return next;
                })
              }
              accessibilityLabel={h.name || h.ip}
            />
            <View className="min-w-0 flex-1">
              <Text weight="medium" className="text-row text-foreground">
                {h.name || h.ip}
              </Text>
              <Text className="text-meta text-muted-foreground">
                {h.username ? `${h.username}@` : ""}
                {h.ip}:{h.port}
              </Text>
            </View>
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}
