import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateSession, useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";

export function useWizardSession() {
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem("wizard_session_id") || null;
  });
  const queryClient = useQueryClient();
  const isRecovering = useRef(false);

  const { mutate: createSession, isPending: isCreating } = useCreateSession();

  const createNew = useCallback(() => {
    if (isRecovering.current) return;
    isRecovering.current = true;
    createSession(undefined, {
      onSuccess: (data) => {
        setSessionId(data.id);
        localStorage.setItem("wizard_session_id", data.id);
        isRecovering.current = false;
      },
      onError: () => {
        isRecovering.current = false;
      },
    });
  }, [createSession]);

  const { data: session, isLoading: isSessionLoading, isError } = useGetSession(
    sessionId!,
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetSessionQueryKey(sessionId!),
        retry: false,
        staleTime: 0,
        gcTime: 30_000,
      },
    },
  );

  // Create session on first load
  useEffect(() => {
    if (!sessionId && !isCreating) {
      createNew();
    }
  }, [sessionId, isCreating, createNew]);

  // Session not found on server (e.g. server restart) → create a fresh one
  useEffect(() => {
    if (isError && sessionId) {
      localStorage.removeItem("wizard_session_id");
      setSessionId(null);
      queryClient.removeQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      createNew();
    }
  }, [isError, sessionId, queryClient, createNew]);

  const resetSession = useCallback(() => {
    if (sessionId) {
      queryClient.removeQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    }
    localStorage.removeItem("wizard_session_id");
    setSessionId(null);
    isRecovering.current = false;
    createNew();
  }, [sessionId, queryClient, createNew]);

  const refreshSession = useCallback(() => {
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    }
  }, [sessionId, queryClient]);

  const isInitializing = !session && (isSessionLoading || isCreating || !!sessionId);

  return {
    sessionId,
    session,
    isLoading: isInitializing,
    refreshSession,
    resetSession,
  };
}
