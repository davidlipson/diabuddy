import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import { UserProfileProvider } from "./lib/UserProfileContext";
import "./styles.css";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1a1a1a",
      paper: "#252525",
    },
    text: {
      primary: "#ffffff",
      secondary: "#a0a0a0",
      disabled: "#666666",
    },
    primary: {
      main: "#1976d2",
    },
    divider: "#404040",
  },
  typography: {
    fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif',
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <UserProfileProvider>
        <App />
      </UserProfileProvider>
    </ThemeProvider>
  </React.StrictMode>
);
