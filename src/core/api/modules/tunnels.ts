import type { AccountClient } from "../AccountClient";
import type {
  TunnelConfig,
  PluginTunnelConnect,
  TunnelStatus,
} from "@/types/index";

export function createTunnelsApi(c: AccountClient) {
  async function getTunnelStatuses(): Promise<Record<string, TunnelStatus>> {
    try {
      const response = await c.http.tunnel.get("/tunnel/status");
      return response.data || {};
    } catch (error) {
      c.fail(error, "fetch tunnel statuses");
    }
  }

  async function getTunnelStatusByName(
    tunnelName: string,
  ): Promise<TunnelStatus | undefined> {
    const statuses = await getTunnelStatuses();
    return statuses[tunnelName];
  }

  async function connectTunnel(
    tunnelConfig: TunnelConfig | PluginTunnelConnect,
  ): Promise<any> {
    try {
      const response = await c.http.tunnel.post(
        "/tunnel/connect",
        tunnelConfig,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "connect tunnel");
    }
  }

  async function disconnectTunnel(tunnelName: string): Promise<any> {
    try {
      const response = await c.http.tunnel.post("/tunnel/disconnect", {
        tunnelName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "disconnect tunnel");
    }
  }

  async function cancelTunnel(tunnelName: string): Promise<any> {
    try {
      const response = await c.http.tunnel.post("/tunnel/cancel", {
        tunnelName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "cancel tunnel");
    }
  }

  return {
    getTunnelStatuses,
    getTunnelStatusByName,
    connectTunnel,
    disconnectTunnel,
    cancelTunnel,
  };
}

export type TunnelsApi = ReturnType<typeof createTunnelsApi>;
