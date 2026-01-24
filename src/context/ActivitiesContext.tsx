import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  Activity,
  fetchActivities,
  createActivity,
  updateActivity as apiUpdateActivity,
  deleteActivity as apiDeleteActivity,
  CreateActivityPayload,
  UpdateActivityPayload,
} from "../lib/api";

interface ActivitiesContextType {
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
  addActivity: (payload: CreateActivityPayload) => Promise<Activity | null>;
  updateActivity: (
    id: string,
    payload: UpdateActivityPayload
  ) => Promise<Activity | null>;
  deleteActivity: (id: string) => Promise<boolean>;
  refreshActivities: () => Promise<void>;
}

const ActivitiesContext = createContext<ActivitiesContextType | null>(null);

interface ActivitiesProviderProps {
  children: ReactNode;
}

export function ActivitiesProvider({ children }: ActivitiesProviderProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load activities on mount
  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Load last 14 days of activities
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const data = await fetchActivities({ from });
      setActivities(data);
    } catch (err) {
      console.error("Failed to load activities:", err);
      setError("Failed to load activities");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const addActivity = useCallback(
    async (payload: CreateActivityPayload): Promise<Activity | null> => {
      try {
        const newActivity = await createActivity(payload);
        if (newActivity) {
          // Insert in sorted order (newest first)
          setActivities((prev) => {
            const updated = [newActivity, ...prev];
            return updated.sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
          });
          return newActivity;
        }
        return null;
      } catch (err) {
        console.error("Failed to create activity:", err);
        return null;
      }
    },
    []
  );

  const updateActivity = useCallback(
    async (
      id: string,
      payload: UpdateActivityPayload
    ): Promise<Activity | null> => {
      try {
        const updated = await apiUpdateActivity(id, payload);
        if (updated) {
          setActivities((prev) =>
            prev
              .map((a) => (a.id === id ? updated : a))
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              )
          );
          return updated;
        }
        return null;
      } catch (err) {
        console.error("Failed to update activity:", err);
        return null;
      }
    },
    []
  );

  const deleteActivity = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await apiDeleteActivity(id);
      if (success) {
        setActivities((prev) => prev.filter((a) => a.id !== id));
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to delete activity:", err);
      return false;
    }
  }, []);

  return (
    <ActivitiesContext.Provider
      value={{
        activities,
        isLoading,
        error,
        addActivity,
        updateActivity,
        deleteActivity,
        refreshActivities: loadActivities,
      }}
    >
      {children}
    </ActivitiesContext.Provider>
  );
}

export function useActivities() {
  const context = useContext(ActivitiesContext);
  if (!context) {
    throw new Error("useActivities must be used within an ActivitiesProvider");
  }
  return context;
}
