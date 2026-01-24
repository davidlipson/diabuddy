import { useState } from "react";
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
  Collapse,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  ActivityType,
  InsulinType,
  ExerciseIntensity,
  CreateActivityPayload,
  createActivity,
} from "../lib/api";
import { DateTimePicker } from "./DateTimePicker";

interface ActivityModalProps {
  open: boolean;
  onClose: () => void;
  onActivityCreated?: () => void;
  defaultTimestamp?: Date;
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
}: ActivityModalProps) {
  const [activityType, setActivityType] = useState<ActivityType>("meal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Common fields
  const [timestamp, setTimestamp] = useState<Date>(
    defaultTimestamp || new Date(),
  );
  const [notes, setNotes] = useState("");

  // Insulin fields
  const [insulinType, setInsulinType] = useState<InsulinType>("bolus");
  const [units, setUnits] = useState<number>(1);

  // Meal fields
  const [carbsGrams, setCarbsGrams] = useState<number | "">("");
  const [mealDescription, setMealDescription] = useState("");

  // Exercise fields
  const [exerciseType, setExerciseType] = useState<string>("Walking");
  const [durationMins, setDurationMins] = useState<number>(30);
  const [intensity, setIntensity] = useState<ExerciseIntensity>("medium");

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
    setNotes("");
    setShowNotes(false);
    setInsulinType("bolus");
    setUnits(1);
    setCarbsGrams("");
    setMealDescription("");
    setExerciseType("Walking");
    setDurationMins(30);
    setIntensity("medium");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      const payload: CreateActivityPayload = {
        type: activityType,
        timestamp: timestamp.toISOString(),
        notes: notes || undefined,
      };

      if (activityType === "insulin") {
        if (units <= 0) {
          alert("Please enter insulin units");
          setIsSubmitting(false);
          return;
        }
        payload.insulinType = insulinType;
        payload.units = units;
      } else if (activityType === "meal") {
        payload.carbsGrams = carbsGrams === "" ? undefined : carbsGrams;
        payload.description = mealDescription || undefined;
      } else {
        payload.exerciseType = exerciseType;
        payload.durationMins = durationMins;
        payload.intensity = intensity;
      }

      const result = await createActivity(payload);
      if (result) {
        onActivityCreated?.();
        handleClose();
      } else {
        alert("Failed to save activity. Please try again.");
      }
    } catch (error) {
      console.error("Error creating activity:", error);
      alert("An error occurred. Please try again.");
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
            Log Activity
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

          {/* Meal Fields */}
          {activityType === "meal" && (
            <>
              <TextField
                label="Carbs (grams)"
                type="number"
                value={carbsGrams}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setCarbsGrams("");
                  } else {
                    const num = Number(val);
                    setCarbsGrams(num < 0 ? 0 : num);
                  }
                }}
                size="small"
                fullWidth
                sx={inputStyle}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Description (optional)"
                value={mealDescription}
                onChange={(e) => setMealDescription(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                sx={inputStyle}
                placeholder="e.g., Pasta with sauce"
              />
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

          {/* Notes (collapsible) */}
          <Box>
            <Button
              onClick={() => setShowNotes(!showNotes)}
              sx={{
                color: "rgba(255,255,255,0.5)",
                textTransform: "none",
                fontSize: 13,
                p: 0,
                minWidth: 0,
                "&:hover": {
                  bgcolor: "transparent",
                  color: "rgba(255,255,255,0.7)",
                },
              }}
              endIcon={
                <ExpandMoreIcon
                  sx={{
                    transform: showNotes ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                />
              }
            >
              Add notes
            </Button>
            <Collapse in={showNotes}>
              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                sx={{ ...inputStyle, mt: 1 }}
              />
            </Collapse>
          </Box>
        </Box>

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
