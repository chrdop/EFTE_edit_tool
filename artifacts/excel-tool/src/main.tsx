import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "./pages/Login";

setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY));

createRoot(document.getElementById("root")!).render(<App />);
