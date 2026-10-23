import type {
  Credential,
  SSHHost,
  SSHHostData,
  Snippet,
  SnippetFolder,
} from "@/types";

export type Unsubscribe = () => void;

/** Lists that can tell when they changed, so screens stay live. */
export interface Watchable {
  subscribe(listener: () => void): Unsubscribe;
}

export interface Repository<T, Draft> extends Watchable {
  list(): Promise<T[]>;
  get(id: number): Promise<T | null>;
  create(draft: Draft): Promise<T>;
  update(id: number, draft: Draft): Promise<T>;
  remove(id: number): Promise<void>;
}

export interface SnippetRepository extends Repository<
  Snippet,
  Partial<Snippet>
> {
  reorder(
    items: { id: number; order: number; folder?: string }[],
  ): Promise<void>;
}

/** Snippet folders are named by their name, like the server routes. */
export interface SnippetFolderRepository extends Watchable {
  list(): Promise<SnippetFolder[]>;
  create(folder: {
    name: string;
    color?: string;
    icon?: string;
  }): Promise<void>;
  rename(oldName: string, newName: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface HostFolder {
  name: string;
  color?: string;
  icon?: string;
}

export interface HostFolderRepository extends Watchable {
  list(): Promise<HostFolder[]>;
}

/** Commands typed into a host's terminal, newest first. */
export interface CommandHistoryRepository {
  list(host: SSHHost): Promise<string[]>;
  add(host: SSHHost, command: string): Promise<void>;
  remove(host: SSHHost, command: string): Promise<void>;
  clear(host: SSHHost): Promise<void>;
}

export interface ActivityEntry {
  kind: string;
  title: string;
  hostSyncId?: string | null;
  at: string;
}

export interface RecentActivityRepository extends Watchable {
  list(limit?: number): Promise<ActivityEntry[]>;
  add(entry: Omit<ActivityEntry, "at">): Promise<void>;
}

/** Where an account keeps its data. */
export interface DataRepositories {
  /** "local" for the encrypted store on this phone, "server" for the server. */
  source: "local" | "server" | "none";
  hosts: Repository<SSHHost, SSHHostData>;
  hostFolders: HostFolderRepository;
  credentials: Repository<Credential, Partial<Credential>>;
  snippets: SnippetRepository;
  snippetFolders: SnippetFolderRepository;
  commandHistory: CommandHistoryRepository;
  recentActivity: RecentActivityRepository;
}
