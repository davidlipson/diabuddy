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
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  Activity,
  ActivityType,
  InsulinType,
  InsulinRecord,
  FoodRecord,
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

export function ActivityModal({
  open,
  onClose,
  onActivityCreated,
  defaultTimestamp,
  editActivity,
}: ActivityModalProps) {
  const { addInsulin, addFood, updateInsulin, updateFood } = useActivities();
  const isEditing = !!editActivity;

  const [activityType, setActivityType] = useState<ActivityType>("food");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common fields
  const [timestamp, setTimestamp] = useState<Date>(
    defaultTimestamp || new Date(),
  );

  // Insulin fields
  const [insulinType, setInsulinType] = useState<InsulinType>("bolus");
  const [units, setUnits] = useState<number>(1);

  // Food fields
  const [foodDescription, setFoodDescription] = useState("");

  // Populate form when editing
  useEffect(() => {
    if (editActivity && open) {
      setActivityType(editActivity.type);
      setTimestamp(new Date(editActivity.timestamp));
      setError(null);

      if (editActivity.type === "insulin") {
        const record = editActivity as InsulinRecord;
        setInsulinType(record.insulin_type);
        setUnits(record.units);
      } else if (editActivity.type === "food") {
        const record = editActivity as FoodRecord;
        setFoodDescription(record.description || "");
      }
    }
  }, [editActivity, open]);

  function resetForm() {
    setActivityType("food");
    setTimestamp(new Date());
    setInsulinType("bolus");
    setUnits(1);
    setFoodDescription("");
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
      } else if (activityType === "food") {
        if (!foodDescription.trim()) {
          setError("Please describe what you ate");
          setIsSubmitting(false);
          return;
        }
      }

      let result;

      if (isEditing && editActivity) {
        // Update existing
        if (activityType === "insulin") {
          result = await updateInsulin(editActivity.id, {
            timestamp: timestamp.toISOString(),
            insulinType,
            units,
          });
        } else {
          result = await updateFood(editActivity.id, {
            timestamp: timestamp.toISOString(),
            description: foodDescription.trim(),
          });
        }
      } else {
        // Create new
        if (activityType === "insulin") {
          result = await addInsulin({
            timestamp: timestamp.toISOString(),
            insulinType,
            units,
          });
        } else {
          result = await addFood({
            timestamp: timestamp.toISOString(),
            description: foodDescription.trim(),
          });
        }
      }

      if (result) {
        onActivityCreated?.();
        handleClose();
      } else {
        setError("Failed to save. Please try again.");
      }
    } catch (err) {
      console.error("Error saving:", err);
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
            {isEditing ? "Edit Entry" : "Log Entry"}
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
          <ToggleButton value="food">Food</ToggleButton>
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

          {/* Food Fields */}
          {activityType === "food" && (
            <>
              <TextField
                label="What did you eat?"
                value={foodDescription}
                onChange={(e) => setFoodDescription(e.target.value)}
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
