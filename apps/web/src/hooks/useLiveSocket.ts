"use client";

import * as React from "react";
import { io, Socket } from "socket.io-client";

export interface SocketSessionEventPayload {
  sessionId: string;
  queueRevision: number;
  status?: string;
  timestamp?: string;
}

export interface SocketPlayerEventPayload {
  sessionId: string;
  queueRevision: number;
  currentQueueEntryId?: string | null;
  loadedIntoPlayerAt?: string | null;
  timestamp?: string;
}

export interface SocketJoinResponse {
  success: boolean;
  snapshot?: Record<string, unknown>;
  message?: string;
  isHost?: boolean;
}

export interface SocketEventHandlers {
  onSessionStarted?: (payload: SocketSessionEventPayload) => void;
  onSessionPaused?: (payload: SocketSessionEventPayload) => void;
  onSessionEnded?: (payload: SocketSessionEventPayload) => void;
  onPlayerPlayNext?: (payload: SocketPlayerEventPayload) => void;
  onPlayerLoaded?: (payload: SocketPlayerEventPayload) => void;
  onPlayerCleared?: (payload: SocketPlayerEventPayload) => void;
  onReconcile?: () => void;
}

export const useLiveSocket = (
  sessionId: string | null,
  handlers: SocketEventHandlers,
) => {
  const [isConnected, setIsConnected] = React.useState(false);
  const [socketError, setSocketError] = React.useState<string | null>(null);
  const socketRef = React.useRef<Socket | null>(null);

  // Keep handlers fresh in ref
  const handlersRef = React.useRef(handlers);
  React.useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  React.useEffect(() => {
    if (!sessionId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl && typeof window !== "undefined" && window.location.hostname !== "localhost") {
      // In cloud preview environment where separate WS port is not exposed, use polling fallback
      setIsConnected(true);
      const pollInterval = setInterval(() => {
        handlersRef.current.onReconcile?.();
      }, 8000);
      return () => clearInterval(pollInterval);
    }

    const socketUrl =
      wsUrl ||
      (typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:4000"
        : "http://localhost:4000");

    let socket: Socket | null = null;
    try {
      socket = io(socketUrl, {
        withCredentials: true,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 5000,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setIsConnected(true);
        setSocketError(null);
        // Join authoritative session room
        socket?.emit(
          "join-session",
          { sessionId },
          (res: SocketJoinResponse) => {
            if (res?.success) {
              handlersRef.current.onReconcile?.();
            } else {
              setSocketError(res?.message || "Failed to join live session room");
            }
          },
        );
      });

      socket.on("disconnect", () => {
        setIsConnected(false);
      });

      socket.on("connect_error", () => {
        setIsConnected(false);
        // On connect error, trigger polling fallback
      });

      socket.on("reconnect", () => {
        setIsConnected(true);
        socket?.emit("join-session", { sessionId }, () => {
          handlersRef.current.onReconcile?.();
        });
      });

      // Authoritative event listeners
      socket.on("session.started", (data: SocketSessionEventPayload) => {
        handlersRef.current.onSessionStarted?.(data);
        handlersRef.current.onReconcile?.();
      });

      socket.on("session.paused", (data: SocketSessionEventPayload) => {
        handlersRef.current.onSessionPaused?.(data);
        handlersRef.current.onReconcile?.();
      });

      socket.on("session.ended", (data: SocketSessionEventPayload) => {
        handlersRef.current.onSessionEnded?.(data);
        handlersRef.current.onReconcile?.();
      });

      socket.on("player.playNext", (data: SocketPlayerEventPayload) => {
        handlersRef.current.onPlayerPlayNext?.(data);
        handlersRef.current.onReconcile?.();
      });

      socket.on("player.loaded", (data: SocketPlayerEventPayload) => {
        handlersRef.current.onPlayerLoaded?.(data);
        handlersRef.current.onReconcile?.();
      });

      socket.on("player.cleared", (data: SocketPlayerEventPayload) => {
        handlersRef.current.onPlayerCleared?.(data);
        handlersRef.current.onReconcile?.();
      });
    } catch {
      // Fallback
    }

    // Polling safety timer alongside socket
    const pollInterval = setInterval(() => {
      handlersRef.current.onReconcile?.();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId]);

  return {
    isConnected,
    socketError,
  };
};
