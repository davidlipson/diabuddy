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
  InsulinRecord,
  FoodRecord,
  fetchActivities,
  createInsulin,
  createFood,
  updateInsulin as apiUpdateInsulin,
  updateFood as apiUpdateFood,
  deleteInsulin as apiDeleteInsulin,
  deleteFood as apiDeleteFood,
  CreateInsulinPayload,
  CreateFoodPayload,
  UpdateInsulinPayload,
  UpdateFoodPayload,
} from "../lib/api";

interface ActivitiesContextType {
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
  addInsulin: (payload: CreateInsulinPayload) => Promise<InsulinRecord | null>;
  addFood: (payload: CreateFoodPayload) => Promise<FoodRecord | null>;
  updateInsulin: (id: string, payload: UpdateInsulinPayload) => Promise<InsulinRecord | null>;
  updateFood: (id: string, payload: UpdateFoodPayload) => Promise<FoodRecord | null>;
  deleteActivity: (activity: Activity) => Promise<boolean>;
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

  const sortActivities = (acts: Activity[]) => 
    acts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const addInsulin = useCallback(
    async (payload: CreateInsulinPayload): Promise<InsulinRecord | null> => {
      try {
        const newRecord = await createInsulin(payload);
        if (newRecord) {
          setActivities((prev) => sortActivities([newRecord, ...prev]));
          return newRecord;
        }
        return null;
      } catch (err) {
        console.error("Failed to create insulin:", err);
        return null;
      }
    },
    []
  );

  const addFood = useCallback(
    async (payload: CreateFoodPayload): Promise<FoodRecord | null> => {
      try {
        const newRecord = await createFood(payload);
        if (newRecord) {
          setActivities((prev) => sortActivities([newRecord, ...prev]));
          return newRecord;
        }
        return null;
      } catch (err) {
        console.error("Failed to create food:", err);
        return null;
      }
    },
    []
  );

  const updateInsulin = useCallback(
    async (id: string, payload: UpdateInsulinPayload): Promise<InsulinRecord | null> => {
      try {
        const updated = await apiUpdateInsulin(id, payload);
        if (updated) {
          setActivities((prev) =>
            sortActivities(prev.map((a) => (a.id === id ? updated : a)))
          );
          return updated;
        }
        return null;
      } catch (err) {
        console.error("Failed to update insulin:", err);
        return null;
      }
    },
    []
  );

  const updateFood = useCallback(
    async (id: string, payload: UpdateFoodPayload): Promise<FoodRecord | null> => {
      try {
        const updated = await apiUpdateFood(id, payload);
        if (updated) {
          setActivities((prev) =>
            sortActivities(prev.map((a) => (a.id === id ? updated : a)))
          );
          return updated;
        }
        return null;
      } catch (err) {
        console.error("Failed to update food:", err);
        return null;
      }
    },
    []
  );

  const deleteActivity = useCallback(async (activity: Activity): Promise<boolean> => {
    try {
      const success = activity.type === 'insulin' 
        ? await apiDeleteInsulin(activity.id)
        : await apiDeleteFood(activity.id);
      
      if (success) {
        setActivities((prev) => prev.filter((a) => a.id !== activity.id));
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
        addInsulin,
        addFood,
        updateInsulin,
        updateFood,
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
