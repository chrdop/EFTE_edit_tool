import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "./pages/Login";

setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY));

createRoot(document.getElementById("root")!).render(<App />);
