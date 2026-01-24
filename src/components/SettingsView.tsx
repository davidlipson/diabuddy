import { useState, useEffect } from "react";
import { Stack, Typography, TextField, Box } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import { useUserProfile, UserProfile } from "../lib/UserProfileContext";
import { usePlatform } from "../context";

interface SettingsViewProps {
  sectionIndex: number;
  onBack: () => void;
}

interface SettingConfig {
  key: keyof UserProfile;
  label: string;
  sublabel: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SETTINGS: SettingConfig[] = [
  {
    key: "fastingGlucose",
    label: "Fasting Glucose",
    sublabel:
      "Your morning baseline glucose level. This sets the target for glucose predictions.",
    unit: "mmol/L",
    min: 3.5,
    max: 10,
    step: 0.1,
  },
  {
    key: "insulinToCarbRatio",
    label: "Insulin to Carb Ratio",
    sublabel: "Grams of carbs covered by 1 unit of insulin.",
    unit: "g/U",
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: "basalUnits",
    label: "Basal Insulin",
    sublabel: "Total daily units of long-acting insulin.",
    unit: "units/day",
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: "bolusUnits",
    label: "Bolus",
    sublabel: "Average meal bolus of insulin.",
    unit: "units",
    min: 1,
    max: 50,
    step: 1,
  },
];

// Show all profile settings
export const SETTINGS_COUNT = SETTINGS.length;

// Get decimal places from step size (e.g., 0.1 -> 1, 1 -> 0)
function getDecimalPlaces(step: number): number {
  if (step >= 1) return 0;
  const str = step.toString();
  const decimalIndex = str.indexOf(".");
  return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
}

// Format value to avoid floating point display issues
function formatValue(value: number, step: number): string {
  const decimals = getDecimalPlaces(step);
  return value.toFixed(decimals);
}

export function SettingsView({
  sectionIndex,
  onBack,
}: SettingsViewProps) {
  const { isMobile } = usePlatform();
  const { profile, updateProfile, resetProfile } = useUserProfile();
  const setting = SETTINGS[sectionIndex % SETTINGS.length];

  // Safe area offsets for mobile
  const topOffset = isMobile ? "calc(env(safe-area-inset-top, 0px) + 12px)" : 8;
  const leftOffset = isMobile ? "calc(env(safe-area-inset-left, 0px) + 16px)" : 8;
  const rightOffset = isMobile ? "calc(env(safe-area-inset-right, 0px) + 16px)" : 8;
  const iconSize = isMobile ? "1.5rem" : "1rem";

  const currentValue = profile[setting.key] as number;
  const [localValue, setLocalValue] = useState(
    formatValue(currentValue, setting.step)
  );

  // Sync local value when section changes or profile updates externally
  useEffect(() => {
    setLocalValue(formatValue(currentValue, setting.step));
  }, [currentValue, sectionIndex, setting.step]);

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && parsed >= setting.min && parsed <= setting.max) {
      // Round to step precision to avoid floating point issues
      const decimals = getDecimalPlaces(setting.step);
      const rounded = parseFloat(parsed.toFixed(decimals));
      updateProfile({ [setting.key]: rounded });
    } else {
      setLocalValue(formatValue(currentValue, setting.step));
    }
  };

  const handleIncrement = (delta: number) => {
    const newValue = Math.min(
      setting.max,
      Math.max(setting.min, currentValue + delta * setting.step)
    );
    // Round to step precision to avoid floating point issues
    const decimals = getDecimalPlaces(setting.step);
    const rounded = parseFloat(newValue.toFixed(decimals));
    updateProfile({ [setting.key]: rounded });
  };

  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        py: 2,
        px: 3,
        position: "relative",
      }}
      spacing={2}
      alignItems="center"
      justifyContent="center"
    >
      {/* Header with close and reset buttons */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{
          position: "absolute",
          top: topOffset,
          left: leftOffset,
          right: rightOffset,
          zIndex: 1000,
        }}
      >
        <CloseOutlinedIcon
          onClick={onBack}
          sx={{
            fontSize: iconSize,
            cursor: "pointer",
            opacity: isMobile ? 0.6 : 0.3,
            "&:hover": { opacity: 1 },
          }}
        />
        <RestartAltOutlinedIcon
          onClick={resetProfile}
          sx={{
            fontSize: iconSize,
            cursor: "pointer",
            opacity: isMobile ? 0.6 : 0.3,
            "&:hover": { opacity: 1 },
          }}
        />
      </Stack>

      {/* Section indicator */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ position: "absolute", top: 12 }}
      >
        {Array.from({ length: SETTINGS_COUNT }).map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor:
                i === sectionIndex ? "primary.main" : "rgba(255,255,255,0.2)",
              transition: "background-color 0.2s",
            }}
          />
        ))}
      </Stack>

      {/* Setting label */}
      <Typography
        variant="subtitle1"
        fontWeight={600}
        sx={{ textAlign: "center" }}
      >
        {setting.label}
      </Typography>

      {/* Value input with +/- buttons */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          onClick={() => handleIncrement(-1)}
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { borderColor: "rgba(255,255,255,0.4)" },
            "&:active": { backgroundColor: "rgba(255,255,255,0.1)" },
          }}
        >
          <Typography variant="h6" color="text.secondary">
            −
          </Typography>
        </Box>

        <Stack direction="row" alignItems="baseline" spacing={0.5}>
          <TextField
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === "Enter" && handleBlur()}
            variant="standard"
            inputProps={{
              type: "text",
              inputMode: "decimal",
              style: {
                textAlign: "center",
                fontSize: "2rem",
                fontWeight: 600,
                width: 80,
                padding: 0,
              },
            }}
            sx={{
              "& .MuiInput-underline:before": { borderColor: "transparent" },
              "& .MuiInput-underline:hover:before": {
                borderColor: "rgba(255,255,255,0.2)",
              },
              "& .MuiInput-underline:after": { borderColor: "primary.main" },
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {setting.unit}
          </Typography>
        </Stack>

        <Box
          onClick={() => handleIncrement(1)}
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { borderColor: "rgba(255,255,255,0.4)" },
            "&:active": { backgroundColor: "rgba(255,255,255,0.1)" },
          }}
        >
          <Typography variant="h6" color="text.secondary">
            +
          </Typography>
        </Box>
      </Stack>

      {/* Description */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          textAlign: "center",
          maxWidth: 240,
          lineHeight: 1.5,
        }}
      >
        {setting.sublabel}
      </Typography>
    </Stack>
  );
}
