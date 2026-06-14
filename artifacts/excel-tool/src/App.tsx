import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Wizard } from "@/pages/Wizard";
import Login, { AUTH_TOKEN_KEY } from "@/pages/Login";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      setAuthenticated(true);
    } else {
      setAuthenticated(false);
      navigate("/login");
    }
  }, [navigate]);

  if (authenticated === null) return null;
  if (!authenticated) return null;
  return <>{children}</>;
}

function Router() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(AUTH_TOKEN_KEY),
  );

  function handleLogin(newToken: string) {
    setToken(newToken);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Switch>
      <Route path="/">
        <AuthGuard>
          <Wizard />
        </AuthGuard>
      </Route>
      <Route path="/login">
        <Login onLogin={handleLogin} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
