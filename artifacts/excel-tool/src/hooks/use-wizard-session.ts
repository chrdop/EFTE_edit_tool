import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useCreateSession, useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";

export function useWizardSession() {
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem("wizard_session_id") || null;
  });

  const queryClient = useQueryClient();

  const { mutate: createSession, isPending: isCreating } = useCreateSession();

  const { data: session, isLoading: isSessionLoading, isError } = useGetSession(
    sessionId!,
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetSessionQueryKey(sessionId!),
        retry: 1
      }
    }
  );

  // If no session, create one
  useEffect(() => {
    if (!sessionId && !isCreating) {
      createSession(undefined, {
        onSuccess: (data) => {
          setSessionId(data.id);
          localStorage.setItem("wizard_session_id", data.id);
        }
      });
    }
  }, [sessionId, isCreating, createSession]);

  // If error loading session (e.g. not found), clear it and create new
  useEffect(() => {
    if (sessionId && isError) {
      setSessionId(null);
      localStorage.removeItem("wizard_session_id");
    }
  }, [sessionId, isError]);

  const resetSession = useCallback(() => {
    setSessionId(null);
    localStorage.removeItem("wizard_session_id");
  }, []);

  const refreshSession = useCallback(() => {
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
    }
  }, [sessionId, queryClient]);

  return {
    sessionId,
    session,
    isLoading: isSessionLoading || isCreating || (!session && !!sessionId && !isError),
    refreshSession,
    resetSession
  };
}
