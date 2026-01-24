import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Chip,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import {
  Activity,
  ActivityType,
  fetchActivities,
  deleteActivity,
  InsulinDetails,
  MealDetails,
  ExerciseDetails,
} from "../lib/api";
import { usePlatform } from "../context";

interface ActivityLogViewProps {
  onEditActivity?: (activity: Activity) => void;
}

type FilterType = ActivityType | "all";

// Activity type colors and icons
const ACTIVITY_CONFIG = {
  insulin: {
    color: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.15)",
    label: "Insulin",
  },
  meal: {
    color: "#f97316",
    bgColor: "rgba(249, 115, 22, 0.15)",
    label: "Meal",
  },
  exercise: {
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.15)",
    label: "Exercise",
  },
};

function formatActivityDate(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

function formatActivityTime(date: Date): string {
  return format(date, "h:mm a");
}

function getActivityDescription(activity: Activity): string {
  const details = activity.details;

  if (activity.activity_type === "insulin") {
    const d = details as InsulinDetails;
    return `${d.units} units ${d.insulin_type}`;
  } else if (activity.activity_type === "meal") {
    const d = details as MealDetails;
    const parts: string[] = [];
    if (d.carbs_grams) parts.push(`${d.carbs_grams}g carbs`);
    if (d.description) parts.push(d.description);
    return parts.length > 0 ? parts.join(" - ") : "Meal logged";
  } else {
    const d = details as ExerciseDetails;
    const parts: string[] = [];
    if (d.exercise_type) parts.push(d.exercise_type);
    if (d.duration_mins) parts.push(`${d.duration_mins} min`);
    if (d.intensity) parts.push(d.intensity);
    return parts.length > 0 ? parts.join(" - ") : "Exercise logged";
  }
}

// Group activities by date
function groupByDate(activities: Activity[]): Map<string, Activity[]> {
  const groups = new Map<string, Activity[]>();

  for (const activity of activities) {
    const date = startOfDay(new Date(activity.timestamp));
    const key = date.toISOString();

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(activity);
  }

  return groups;
}

interface ActivityCardProps {
  activity: Activity;
  onEdit?: () => void;
  onDelete?: () => void;
}

function ActivityCard({ activity, onEdit, onDelete }: ActivityCardProps) {
  const config = ACTIVITY_CONFIG[activity.activity_type];
  const timestamp = new Date(activity.timestamp);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 2,
        p: 2,
        borderRadius: 2,
        bgcolor: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        "&:hover": {
          bgcolor: "rgba(255,255,255,0.05)",
        },
      }}
    >
      {/* Time indicator */}
      <Box
        sx={{
          minWidth: 56,
          textAlign: "right",
          pt: 0.5,
        }}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {formatActivityTime(timestamp)}
        </Typography>
      </Box>

      {/* Activity indicator line */}
      <Box
        sx={{
          width: 3,
          minHeight: 40,
          borderRadius: 1.5,
          bgcolor: config.color,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
          <Chip
            label={config.label}
            size="small"
            sx={{
              bgcolor: config.bgColor,
              color: config.color,
              fontWeight: 500,
              fontSize: 11,
              height: 22,
            }}
          />
          {activity.source === "predicted" && (
            <Chip
              label="Suggested"
              size="small"
              sx={{
                bgcolor: "rgba(25, 118, 210, 0.15)",
                color: "#1976d2",
                fontWeight: 500,
                fontSize: 10,
                height: 20,
              }}
            />
          )}
        </Stack>

        <Typography
          sx={{
            color: "rgba(255,255,255,0.9)",
            fontSize: 14,
            fontWeight: 500,
            mb: activity.notes ? 0.5 : 0,
          }}
        >
          {getActivityDescription(activity)}
        </Typography>

        {activity.notes && (
          <Typography
            sx={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            {activity.notes}
          </Typography>
        )}
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        <IconButton
          size="small"
          onClick={onEdit}
          sx={{
            color: "rgba(255,255,255,0.4)",
            "&:hover": { color: "rgba(255,255,255,0.7)" },
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={onDelete}
          sx={{
            color: "rgba(255,255,255,0.4)",
            "&:hover": { color: "#ef4444" },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}

export function ActivityLogView({ onEditActivity }: ActivityLogViewProps) {
  const { isMobile } = usePlatform();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Load activities
  useEffect(() => {
    async function loadActivities() {
      setIsLoading(true);
      try {
        // Load last 7 days of activities
        const from = new Date();
        from.setDate(from.getDate() - 7);
        const data = await fetchActivities({ from });
        setActivities(data);
      } catch (error) {
        console.error("Failed to load activities:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadActivities();
  }, []);

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((a) => a.activity_type === filter);
  }, [activities, filter]);

  // Group by date
  const groupedActivities = useMemo(() => {
    return groupByDate(filteredActivities);
  }, [filteredActivities]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;

    const success = await deleteActivity(id);
    if (success) {
      setActivities((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleEdit = (activity: Activity) => {
    onEditActivity?.(activity);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <CircularProgress size={32} sx={{ color: "rgba(255,255,255,0.5)" }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        px: isMobile ? 2 : 3,
        pt: isMobile ? "calc(env(safe-area-inset-top, 0px) + 16px)" : 2,
        pb: 2,
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography
          sx={{
            color: "rgba(255,255,255,0.9)",
            fontSize: isMobile ? 20 : 16,
            fontWeight: 600,
          }}
        >
          Activity Log
        </Typography>

        <IconButton
          onClick={() => setShowFilters(!showFilters)}
          sx={{
            color: filter === "all" ? "rgba(255,255,255,0.5)" : "#1976d2",
          }}
        >
          <FilterListIcon />
        </IconButton>
      </Stack>

      {/* Filters */}
      {showFilters && (
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          {(["all", "insulin", "meal", "exercise"] as FilterType[]).map(
            (type) => (
              <Chip
                key={type}
                label={type === "all" ? "All" : ACTIVITY_CONFIG[type].label}
                onClick={() => setFilter(type)}
                sx={{
                  bgcolor:
                    filter === type
                      ? type === "all"
                        ? "rgba(25, 118, 210, 0.2)"
                        : ACTIVITY_CONFIG[type].bgColor
                      : "rgba(255,255,255,0.05)",
                  color:
                    filter === type
                      ? type === "all"
                        ? "#1976d2"
                        : ACTIVITY_CONFIG[type].color
                      : "rgba(255,255,255,0.6)",
                  fontWeight: filter === type ? 600 : 400,
                  border: "1px solid",
                  borderColor:
                    filter === type
                      ? type === "all"
                        ? "#1976d2"
                        : ACTIVITY_CONFIG[type].color
                      : "transparent",
                  "&:hover": {
                    bgcolor:
                      type === "all"
                        ? "rgba(25, 118, 210, 0.15)"
                        : ACTIVITY_CONFIG[type].bgColor,
                  },
                }}
              />
            )
          )}
        </Stack>
      )}

      {/* Activity List */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": {
            width: 6,
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "rgba(255,255,255,0.1)",
            borderRadius: 3,
          },
        }}
      >
        {groupedActivities.size === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "60%",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <Typography sx={{ fontSize: 14, mb: 1 }}>
              No activities logged yet
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Tap the + button to log an activity
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            {Array.from(groupedActivities.entries()).map(([dateKey, dayActivities]) => (
              <Box key={dateKey}>
                <Typography
                  sx={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    mb: 1.5,
                    px: 1,
                  }}
                >
                  {formatActivityDate(new Date(dateKey))}
                </Typography>

                <Stack spacing={1.5}>
                  {dayActivities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      onEdit={() => handleEdit(activity)}
                      onDelete={() => handleDelete(activity.id)}
                    />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
