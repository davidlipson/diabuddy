import { useState, useEffect, useCallback } from "react";
import { libreLinkUp, GlucoseData } from "../lib/librelinkup";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from "../lib/credentialStore";
import { useWindowResize } from "./useWindowResize";

interface AuthState {
  isLoading: boolean;
  isLoggedIn: boolean;
  loginLoading: boolean;
  connectionId: string | null;
  patientId: string | null;
}

interface UseAuthReturn extends AuthState {
  handleLogin: (email: string, password: string) => Promise<boolean>;
  handleLogout: () => Promise<void>;
  initialGlucoseData: GlucoseData | null;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isLoggedIn: false,
    loginLoading: false,
    connectionId: null,
    patientId: null,
  });
  const [initialGlucoseData, setInitialGlucoseData] =
    useState<GlucoseData | null>(null);

  const { expandWindow, collapseWindow } = useWindowResize();

  // Attempt login with credentials
  const attemptLogin = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        let success = await libreLinkUp.login(email, password);
        if (!success) {
          success = await libreLinkUp.loginWithRegion(email, password, "us");
        }
        if (!success) {
          success = await libreLinkUp.loginWithRegion(email, password, "eu");
        }

        if (success) {
          const connections = await libreLinkUp.getConnections();
          if (connections.length > 0) {
            const connection = connections[0];
            setState((prev) => ({
              ...prev,
              connectionId: connection.id,
              patientId: connection.patientId,
              isLoggedIn: true,
            }));

            if (connection.glucoseMeasurement) {
              const gm = connection.glucoseMeasurement;
              setInitialGlucoseData({
                current: {
                  value: gm.ValueInMgPerDl,
                  valueMmol: gm.Value,
                  timestamp: new Date(gm.Timestamp),
                  trendArrow: gm.TrendArrow,
                  isHigh: gm.isHigh,
                  isLow: gm.isLow,
                },
                history: [],
                connection: {
                  id: connection.id,
                  patientId: connection.patientId,
                  firstName: connection.firstName,
                  lastName: connection.lastName,
                },
              });
            }
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error("Login failed:", err);
        return false;
      }
    },
    []
  );

  // Handle login from LoginView
  const handleLogin = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, loginLoading: true }));
      try {
        const success = await attemptLogin(email, password);
        if (success) {
          await saveCredentials(email, password);
          collapseWindow();
          return true;
        }
        return false;
      } finally {
        setState((prev) => ({ ...prev, loginLoading: false }));
      }
    },
    [attemptLogin, collapseWindow]
  );

  // Handle logout
  const handleLogout = useCallback(async () => {
    await clearCredentials();
    setState({
      isLoading: false,
      isLoggedIn: false,
      loginLoading: false,
      connectionId: null,
      patientId: null,
    });
    setInitialGlucoseData(null);
    expandWindow();
  }, [expandWindow]);

  // Auto-login on mount from stored credentials
  useEffect(() => {
    const initLogin = async () => {
      const creds = await loadCredentials();
      if (creds) {
        const success = await attemptLogin(creds.email, creds.password);
        if (!success) {
          // Credentials invalid, clear them
          await clearCredentials();
        }
      }
      setState((prev) => ({ ...prev, isLoading: false }));
    };

    initLogin();
  }, [attemptLogin]);

  return {
    ...state,
    handleLogin,
    handleLogout,
    initialGlucoseData,
  };
}

