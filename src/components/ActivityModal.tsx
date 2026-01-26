import { useState, useEffect } from "react";
import {
  Box,
  Modal,
  Typography,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  Activity,
  ActivityType,
  InsulinType,
  ExerciseIntensity,
  InsulinDetails,
  MealDetails,
  ExerciseDetails,
} from "../lib/api";
import { useActivities } from "../context";
import { DateTimePicker } from "./DateTimePicker";

interface ActivityModalProps {
  open: boolean;
  onClose: () => void;
  onActivityCreated?: () => void;
  defaultTimestamp?: Date;
  editActivity?: Activity | null;
}

const EXERCISE_TYPES = [
  "Walking",
  "Running",
  "Cycling",
  "Weights",
  "Yoga",
  "HIIT",
  "Other",
];

export function ActivityModal({
  open,
  onClose,
  onActivityCreated,
  defaultTimestamp,
  editActivity,
}: ActivityModalProps) {
  const { addActivity, updateActivity } = useActivities();
  const isEditing = !!editActivity;

  const [activityType, setActivityType] = useState<ActivityType>("meal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common fields
  const [timestamp, setTimestamp] = useState<Date>(
    defaultTimestamp || new Date(),
  );

  // Insulin fields
  const [insulinType, setInsulinType] = useState<InsulinType>("bolus");
  const [units, setUnits] = useState<number>(1);

  // Meal fields - just description, macros estimated by backend
  const [mealDescription, setMealDescription] = useState("");

  // Exercise fields
  const [exerciseType, setExerciseType] = useState<string>("Walking");
  const [durationMins, setDurationMins] = useState<number>(30);
  const [intensity, setIntensity] = useState<ExerciseIntensity>("medium");

  // Populate form when editing
  useEffect(() => {
    if (editActivity && open) {
      setActivityType(editActivity.activity_type);
      setTimestamp(new Date(editActivity.timestamp));
      setError(null);

      if (editActivity.activity_type === "insulin") {
        const details = editActivity.details as InsulinDetails;
        setInsulinType(details.insulin_type as InsulinType);
        setUnits(details.units);
      } else if (editActivity.activity_type === "meal") {
        const details = editActivity.details as MealDetails;
        setMealDescription(details.description || "");
      } else if (editActivity.activity_type === "exercise") {
        const details = editActivity.details as ExerciseDetails;
        setExerciseType(details.exercise_type || "Walking");
        setDurationMins(details.duration_mins || 30);
        setIntensity((details.intensity as ExerciseIntensity) || "medium");
      }
    }
  }, [editActivity, open]);

  function formatDuration(mins: number): string {
    if (mins <= 55) {
      return `${mins} min`;
    }
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (remainingMins === 0) {
      return `${hours}hr`;
    }
    return `${hours}hr ${remainingMins}m`;
  }

  function resetForm() {
    setActivityType("meal");
    setTimestamp(new Date());
    setInsulinType("bolus");
    setUnits(1);
    setMealDescription("");
    setExerciseType("Walking");
    setDurationMins(30);
    setIntensity("medium");
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      // Validation
      if (activityType === "insulin") {
        if (units <= 0) {
          setError("Units must be greater than 0");
          setIsSubmitting(false);
          return;
        }
      } else if (activityType === "meal") {
        if (!mealDescription.trim()) {
          setError("Please describe what you ate");
          setIsSubmitting(false);
          return;
        }
      } else if (activityType === "exercise") {
        if (durationMins <= 0) {
          setError("Duration must be longer than 0");
          setIsSubmitting(false);
          return;
        }
      }

      let result;

      if (isEditing && editActivity) {
        // Update existing activity
        const updatePayload = {
          timestamp: timestamp.toISOString(),
          ...(activityType === "insulin" && {
            insulinType,
            units,
          }),
          ...(activityType === "meal" && {
            description: mealDescription.trim(),
          }),
          ...(activityType === "exercise" && {
            exerciseType,
            durationMins,
            intensity,
          }),
        };
        result = await updateActivity(editActivity.id, updatePayload);
      } else {
        // Create new activity
        const createPayload = {
          type: activityType,
          timestamp: timestamp.toISOString(),
          ...(activityType === "insulin" && {
            insulinType,
            units,
          }),
          ...(activityType === "meal" && {
            description: mealDescription.trim(),
          }),
          ...(activityType === "exercise" && {
            exerciseType,
            durationMins,
            intensity,
          }),
        };
        result = await addActivity(createPayload);
      }

      if (result) {
        onActivityCreated?.();
        handleClose();
      } else {
        setError("Failed to save activity. Please try again.");
      }
    } catch (err) {
      console.error("Error saving activity:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modalStyle = {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(90vw, 360px)",
    bgcolor: "#1a1a1a",
    borderRadius: 3,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    p: 3,
    outline: "none",
  };

  const inputStyle = {
    "& .MuiOutlinedInput-root": {
      color: "white",
      "& fieldset": { borderColor: "rgba(255,255,255,0.2)" },
      "&:hover fieldset": { borderColor: "rgba(255,255,255,0.3)" },
      "&.Mui-focused fieldset": { borderColor: "#1976d2" },
    },
    "& .MuiInputLabel-root": {
      color: "rgba(255,255,255,0.5)",
      "&.Mui-focused": { color: "#1976d2" },
    },
    "& .MuiInputBase-input": {
      color: "white",
    },
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <Box sx={modalStyle}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2.5,
          }}
        >
          <Typography sx={{ color: "white", fontSize: 18, fontWeight: 600 }}>
            {isEditing ? "Edit Activity" : "Log Activity"}
          </Typography>
          <IconButton
            onClick={handleClose}
            sx={{ color: "rgba(255,255,255,0.5)" }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Activity Type Selector */}
        <ToggleButtonGroup
          value={activityType}
          exclusive
          onChange={(_, value) => value && setActivityType(value)}
          fullWidth
          sx={{
            mb: 2.5,
            "& .MuiToggleButton-root": {
              color: "rgba(255,255,255,0.6)",
              borderColor: "rgba(255,255,255,0.2)",
              textTransform: "none",
              py: 1,
              fontSize: 14,
              fontWeight: 500,
              "&.Mui-selected": {
                bgcolor: "rgba(25, 118, 210, 0.2)",
                color: "#1976d2",
                borderColor: "#1976d2",
                "&:hover": {
                  bgcolor: "rgba(25, 118, 210, 0.3)",
                },
              },
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.05)",
              },
            },
          }}
        >
          <ToggleButton value="insulin">Insulin</ToggleButton>
          <ToggleButton value="meal">Meal</ToggleButton>
          <ToggleButton value="exercise">Exercise</ToggleButton>
        </ToggleButtonGroup>

        {/* Dynamic Form Fields */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Insulin Fields */}
          {activityType === "insulin" && (
            <>
              <ToggleButtonGroup
                value={insulinType}
                exclusive
                onChange={(_, value) => value && setInsulinType(value)}
                fullWidth
                size="small"
                sx={{
                  "& .MuiToggleButton-root": {
                    color: "rgba(255,255,255,0.6)",
                    borderColor: "rgba(255,255,255,0.2)",
                    textTransform: "none",
                    "&.Mui-selected": {
                      bgcolor: "rgba(25, 118, 210, 0.15)",
                      color: "#1976d2",
                      borderColor: "#1976d2",
                    },
                  },
                }}
              >
                <ToggleButton value="bolus">Bolus</ToggleButton>
                <ToggleButton value="basal">Basal</ToggleButton>
              </ToggleButtonGroup>

              <Box>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 13,
                    mb: 1,
                  }}
                >
                  Units: {units}
                </Typography>
                <Slider
                  value={units}
                  onChange={(_, value) => setUnits(value as number)}
                  min={1}
                  max={15}
                  step={0.5}
                  valueLabelDisplay="auto"
                  sx={{
                    color: "#1976d2",
                    "& .MuiSlider-thumb": {
                      width: 20,
                      height: 20,
                    },
                  }}
                />
              </Box>
            </>
          )}

          {/* Meal Fields - Just description, macros estimated by AI */}
          {activityType === "meal" && (
            <>
              <TextField
                label="What did you eat?"
                value={mealDescription}
                onChange={(e) => setMealDescription(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={3}
                required
                sx={inputStyle}
                placeholder="e.g., 2 slices of pepperoni pizza and a small salad"
              />
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                Nutrition will be estimated automatically
              </Typography>
            </>
          )}

          {/* Exercise Fields */}
          {activityType === "exercise" && (
            <>
              <FormControl fullWidth size="small" sx={inputStyle}>
                <InputLabel>Exercise Type</InputLabel>
                <Select
                  value={exerciseType}
                  onChange={(e) => setExerciseType(e.target.value)}
                  label="Exercise Type"
                  sx={{
                    color: "white",
                    "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.5)" },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: "#252525",
                        "& .MuiMenuItem-root": {
                          color: "white",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                          "&.Mui-selected": {
                            bgcolor: "rgba(25, 118, 210, 0.2)",
                          },
                        },
                      },
                    },
                  }}
                >
                  {EXERCISE_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 13,
                    mb: 1,
                  }}
                >
                  Duration: {formatDuration(durationMins)}
                </Typography>
                <Slider
                  value={durationMins}
                  onChange={(_, value) => setDurationMins(value as number)}
                  min={5}
                  max={180}
                  step={5}
                  valueLabelDisplay="auto"
                  valueLabelFormat={formatDuration}
                  sx={{ color: "#1976d2" }}
                />
              </Box>

              <ToggleButtonGroup
                value={intensity}
                exclusive
                onChange={(_, value) => value && setIntensity(value)}
                fullWidth
                size="small"
                sx={{
                  "& .MuiToggleButton-root": {
                    color: "rgba(255,255,255,0.6)",
                    borderColor: "rgba(255,255,255,0.2)",
                    textTransform: "none",
                    "&.Mui-selected": {
                      bgcolor: "rgba(25, 118, 210, 0.15)",
                      color: "#1976d2",
                      borderColor: "#1976d2",
                    },
                  },
                }}
              >
                <ToggleButton value="low">Low</ToggleButton>
                <ToggleButton value="medium">Medium</ToggleButton>
                <ToggleButton value="high">High</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}

          {/* Time Picker */}
          <DateTimePicker
            label="Time"
            value={timestamp}
            onChange={setTimestamp}
          />
        </Box>

        {/* Error Message */}
        {error && (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: "rgba(211, 47, 47, 0.15)",
              border: "1px solid rgba(211, 47, 47, 0.3)",
            }}
          >
            <Typography
              sx={{
                color: "#f44336",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {error}
            </Typography>
          </Box>
        )}

        {/* Actions */}
        <Box sx={{ display: "flex", gap: 1.5, mt: 3 }}>
          <Button
            onClick={handleClose}
            fullWidth
            sx={{
              color: "rgba(255,255,255,0.7)",
              borderColor: "rgba(255,255,255,0.2)",
              textTransform: "none",
              "&:hover": {
                borderColor: "rgba(255,255,255,0.3)",
                bgcolor: "rgba(255,255,255,0.05)",
              },
            }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={isSubmitting}
            sx={{
              bgcolor: "#1976d2",
              color: "white",
              textTransform: "none",
              "&:hover": { bgcolor: "#1565c0" },
              "&:disabled": {
                bgcolor: "rgba(25, 118, 210, 0.3)",
                color: "rgba(255,255,255,0.5)",
              },
            }}
            variant="contained"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}
