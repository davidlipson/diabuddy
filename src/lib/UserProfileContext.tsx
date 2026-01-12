import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

/**
 * User Profile for T1D-specific glucose prediction
 *
 * These parameters personalize the Kalman filter and risk assessment
 * for better accuracy with the individual's physiology.
 */
export interface UserProfile {
  // Glucose targets (mmol/L)
  fastingGlucose: number; // Personal baseline for mean reversion

  // Insulin parameters
  insulinToCarbRatio: number; // grams of carbs per 1 unit of insulin
  basalUnits: number; // Daily basal insulin units (Glargine)
  bolusUnits: number; // Typical bolus units (Trurapi/rapid-acting)

  // Insulin types (informational for now)
  basalInsulin: "glargine" | "degludec" | "detemir" | "nph" | "other";
  bolusInsulin: "trurapi" | "lispro" | "aspart" | "fiasp" | "other";

  // CGM info
  cgmType: "libre2" | "libre3" | "dexcom" | "other";
}

// Default profile based on common T1D parameters
const DEFAULT_PROFILE: UserProfile = {
  fastingGlucose: 12.5, // 5.5 is the target
  insulinToCarbRatio: 10, // 1 unit per 10g carbs
  basalUnits: 10, // Typical range 15-40
  bolusUnits: 2, // Typical meal bolus is 5
  basalInsulin: "glargine",
  bolusInsulin: "trurapi",
  cgmType: "libre2",
};

const STORAGE_KEY = "libre-user-profile";

interface UserProfileContextValue {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  resetProfile: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => {
    // Load from localStorage on init
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Failed to load user profile from storage:", e);
    }
    return DEFAULT_PROFILE;
  });

  // Persist to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn("Failed to save user profile:", e);
    }
  }, [profile]);

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  };

  const resetProfile = () => {
    setProfile(DEFAULT_PROFILE);
  };

  return (
    <UserProfileContext.Provider
      value={{ profile, updateProfile, resetProfile }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used within a UserProfileProvider");
  }
  return context;
}

/**
 * Get Kalman filter parameters derived from user profile
 */
export function getKalmanParams(profile: UserProfile) {
  // Mean reversion target = personal fasting glucose
  const MEAN_GLUCOSE = profile.fastingGlucose;

  // CGM-specific parameters
  const cgmParams = {
    libre2: {
      measurementNoise: 0.25, // ~0.5 mmol/L std dev (MARD ~10-12%)
      sampleInterval: 15, // minutes between readings
      sensorLag: 10, // physiological lag in minutes
    },
    libre3: {
      measurementNoise: 0.16, // ~0.4 mmol/L std dev (improved MARD ~9%)
      sampleInterval: 1, // real-time
      sensorLag: 10,
    },
    dexcom: {
      measurementNoise: 0.16,
      sampleInterval: 5,
      sensorLag: 10,
    },
    other: {
      measurementNoise: 0.36, // Conservative
      sampleInterval: 15,
      sensorLag: 12,
    },
  };

  const cgm = cgmParams[profile.cgmType];

  return {
    MEAN_GLUCOSE,
    MEASUREMENT_NOISE: cgm.measurementNoise,
    SAMPLE_INTERVAL: cgm.sampleInterval,
    SENSOR_LAG: cgm.sensorLag,

    // Process noise (keep defaults, could personalize with historical data)
    PROCESS_NOISE_GLUCOSE: 0.01,
    PROCESS_NOISE_VELOCITY: 0.001,

    // Dynamics
    REVERSION_RATE: 0.002,
    DAMPING_FACTOR: 0.98,
  };
}

/**
 * ============================================================================
 * TODO: Future Improvements (v2.0+)
 * ============================================================================
 *
 * 1. HISTORICAL DATA INTEGRATION
 *    - Collect and analyze 2+ weeks of CGM data
 *    - Calculate personal glucose variability (coefficient of variation)
 *    - Estimate individual sensor lag from rate-of-change patterns
 *    - Learn time-of-day patterns (dawn phenomenon, post-meal peaks)
 *    - Auto-tune process noise and measurement noise parameters
 *
 * 2. PUMP DATA INTEGRATION
 *    - Import pump basal profiles and bolus history
 *    - Integrate insulin-on-board (IOB) calculations
 *    - Model active insulin effect on glucose predictions
 *    - Support temp basals and extended boluses
 *
 * 3. LIBRE 3 REAL-TIME UPDATE
 *    - Leverage 1-minute sampling for much better velocity estimation
 *    - Tighter prediction confidence intervals
 *    - Faster response to rapid glucose changes
 *    - Consider reducing process noise for smoother predictions
 *
 * 4. TWO-COMPARTMENT KALMAN FILTER
 *    - State: [bloodGlucose, interstitialGlucose, velocity]
 *    - Model blood → interstitial transfer dynamics
 *    - Better lag compensation for more accurate predictions
 *
 * 5. MEAL/EXERCISE DETECTION
 *    - Detect anomalous glucose rises (likely meal)
 *    - Adjust predictions during detected meal absorption
 *    - Detect exercise-induced glucose drops
 *
 * ============================================================================
 */
