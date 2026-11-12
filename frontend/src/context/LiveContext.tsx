import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, getAuthToken } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import type { AppNotification } from "@/types";

interface LiveContextValue {
  connected: boolean;
  lastEventTick: number;
  notifications: AppNotification[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  scanAlerts: () => Promise<void>;
}

const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEventTick, setLastEventTick] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{ items: AppNotification[]; unread_count: number }>("/notifications");
      setNotifications(res.data.items);
      setUnreadCount(res.data.unread_count);
    } catch {
      // Ignore transient poll failure
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    refreshNotifications();

    const token = getAuthToken();
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws/live?token=${encodeURIComponent(token)}`;
    let alive = true;
    let heartbeat: number | undefined;

    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed.type && parsed.type !== "PONG") {
            setLastEventTick((t) => t + 1);
            refreshNotifications();
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeat) window.clearInterval(heartbeat);
        if (alive) {
          window.setTimeout(connect, 4000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      alive = false;
      if (heartbeat) window.clearInterval(heartbeat);
      wsRef.current?.close();
    };
  }, [user, refreshNotifications]);

  const markRead = async (id: number) => {
    await api.post(`/notifications/${id}/read`);
    await refreshNotifications();
  };

  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    await refreshNotifications();
  };

  const scanAlerts = async () => {
    await api.post("/notifications/scan-alerts");
    await refreshNotifications();
  };

  return (
    <LiveContext.Provider
      value={{
        connected,
        lastEventTick,
        notifications,
        unreadCount,
        refreshNotifications,
        markRead,
        markAllRead,
        scanAlerts,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside LiveProvider");
  return ctx;
}
