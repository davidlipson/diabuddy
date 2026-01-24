import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Chip,
  CircularProgress,
  Collapse,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import {
  AreaChart,
  Area,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  Activity,
  ActivityType,
  InsulinDetails,
  MealDetails,
  ExerciseDetails,
  fetchGlucoseHistoryRange,
} from "../lib/api";
import { GlucoseReading } from "../lib/librelinkup";
import { usePlatform, useActivities } from "../context";

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

// Mini glucose chart for activity cards (non-interactive)
interface MiniGlucoseChartProps {
  readings: GlucoseReading[];
  activityTime: Date;
}

function MiniGlucoseChart({ readings, activityTime }: MiniGlucoseChartProps) {
  const chartData = useMemo(() => {
    return readings
      .map((r) => ({
        time: r.timestamp.getTime(),
        value: r.valueMmol,
      }))
      .sort((a, b) => a.time - b.time);
  }, [readings]);

  if (chartData.length === 0) {
    return (
      <Box
        sx={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          No glucose data for this period
        </Typography>
      </Box>
    );
  }

  // Y-axis: always 0 to max(data, 15)
  const maxValue = Math.max(...chartData.map((d) => d.value), 15);
  const yMin = 0;
  const yMax = maxValue;

  // Activity time marker
  const activityTimeMs = activityTime.getTime();

  return (
    <Box sx={{ height: 70, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="miniGlucoseGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#1976d2" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#1976d2" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Target range background */}
          <ReferenceArea y1={3.9} y2={10.0} fill="#22c55e" fillOpacity={0.08} />

          {/* Low threshold line */}
          <ReferenceLine
            y={3.9}
            stroke="#ef4444"
            strokeDasharray="2 2"
            strokeOpacity={0.5}
          />

          {/* Activity time marker */}
          <ReferenceLine
            x={activityTimeMs}
            stroke="rgba(255,255,255,0.5)"
            strokeDasharray="3 3"
          />

          <YAxis domain={[yMin, yMax]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#1976d2"
            strokeWidth={1.5}
            fill="url(#miniGlucoseGradient)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

interface SwipeableActivityCardProps {
  activity: Activity;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SwipeableActivityCard({
  activity,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: SwipeableActivityCardProps) {
  const config = ACTIVITY_CONFIG[activity.activity_type];
  const timestamp = new Date(activity.timestamp);

  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [glucoseData, setGlucoseData] = useState<GlucoseReading[] | null>(null);
  const [isLoadingGlucose, setIsLoadingGlucose] = useState(false);
  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const ACTION_WIDTH = 100; // Width of action buttons area
  const THRESHOLD = 50; // Minimum swipe to trigger reveal

  // Load glucose data when expanded
  useEffect(() => {
    if (isExpanded && glucoseData === null && !isLoadingGlucose) {
      setIsLoadingGlucose(true);
      fetchGlucoseHistoryRange(activity.timestamp, 2)
        .then((data) => {
          setGlucoseData(data);
        })
        .finally(() => {
          setIsLoadingGlucose(false);
        });
    }
  }, [isExpanded, glucoseData, isLoadingGlucose, activity.timestamp]);

  const handleCardClick = useCallback(() => {
    // Only toggle expand if we didn't drag and actions aren't revealed
    if (!hasDraggedRef.current && !isRevealed) {
      onToggleExpand();
    }
    hasDraggedRef.current = false;
  }, [isRevealed, onToggleExpand]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDraggingRef.current) return;

      const currentX = e.touches[0].clientX;
      const dragDelta = currentX - startXRef.current; // positive = dragging right, negative = dragging left

      // Mark as dragged if moved more than 5px
      if (Math.abs(dragDelta) > 5) {
        hasDraggedRef.current = true;
      }

      let newOffset: number;
      if (isRevealed) {
        // When revealed, dragging right (positive delta) should close
        newOffset = Math.min(
          ACTION_WIDTH,
          Math.max(0, ACTION_WIDTH - dragDelta),
        );
      } else {
        // When closed, dragging left (negative delta) should reveal
        newOffset = Math.min(ACTION_WIDTH, Math.max(0, -dragDelta));
      }
      setOffsetX(newOffset);
    },
    [isRevealed],
  );

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;

    if (offsetX > THRESHOLD) {
      setOffsetX(ACTION_WIDTH);
      setIsRevealed(true);
    } else {
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [offsetX]);

  // Mouse events for desktop testing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;

      const currentX = e.clientX;
      const dragDelta = currentX - startXRef.current; // positive = dragging right, negative = dragging left

      // Mark as dragged if moved more than 5px
      if (Math.abs(dragDelta) > 5) {
        hasDraggedRef.current = true;
      }

      let newOffset: number;
      if (isRevealed) {
        // When revealed, dragging right (positive delta) should close
        newOffset = Math.min(
          ACTION_WIDTH,
          Math.max(0, ACTION_WIDTH - dragDelta),
        );
      } else {
        // When closed, dragging left (negative delta) should reveal
        newOffset = Math.min(ACTION_WIDTH, Math.max(0, -dragDelta));
      }
      setOffsetX(newOffset);
    },
    [isRevealed],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;

    if (offsetX > THRESHOLD) {
      setOffsetX(ACTION_WIDTH);
      setIsRevealed(true);
    } else {
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [offsetX]);

  const handleMouseLeave = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      if (offsetX > THRESHOLD) {
        setOffsetX(ACTION_WIDTH);
        setIsRevealed(true);
      } else {
        setOffsetX(0);
        setIsRevealed(false);
      }
    }
  }, [offsetX]);

  const closeActions = useCallback(() => {
    setOffsetX(0);
    setIsRevealed(false);
  }, []);

  // Close actions when clicking outside
  useEffect(() => {
    if (!isRevealed) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeActions();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isRevealed, closeActions]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 2,
      }}
    >
      {/* Action buttons (behind the card) */}
      <Box
        sx={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: ACTION_WIDTH,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <IconButton
          onClick={() => {
            closeActions();
            onEdit();
          }}
          sx={{
            flex: 1,
            borderRadius: 0,
            bgcolor: "#1976d2",
            color: "white",
            "&:hover": { bgcolor: "#1565c0" },
          }}
        >
          <EditIcon />
        </IconButton>
        <IconButton
          onClick={() => {
            closeActions();
            onDelete();
          }}
          sx={{
            flex: 1,
            borderRadius: 0,
            bgcolor: "#ef4444",
            color: "white",
            "&:hover": { bgcolor: "#dc2626" },
          }}
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      {/* Main card content */}
      <Box
        data-no-swipe
        onClick={handleCardClick}
        onTouchStart={(e) => {
          e.stopPropagation();
          handleTouchStart(e);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          handleTouchMove(e);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          handleTouchEnd();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        sx={{
          display: "flex",
          flexDirection: "column",
          bgcolor: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          transform: `translateX(-${offsetX}px)`,
          transition: isDraggingRef.current
            ? "none"
            : "transform 0.2s ease-out",
          cursor: "pointer",
        }}
      >
        {/* Card header row */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
            p: 2,
            pb: isExpanded ? 1 : 2,
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

        </Box>

        {/* Expanded glucose chart section */}
        <Collapse in={isExpanded}>
          <Box onClick={(e) => e.stopPropagation()}>
            {isLoadingGlucose ? (
              <Box
                sx={{
                  height: 70,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CircularProgress
                  size={20}
                  sx={{ color: "rgba(255,255,255,0.3)" }}
                />
              </Box>
            ) : glucoseData ? (
              <MiniGlucoseChart
                readings={glucoseData}
                activityTime={timestamp}
              />
            ) : null}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}

export function ActivityLogView({ onEditActivity }: ActivityLogViewProps) {
  const { isMobile } = usePlatform();
  const { activities, isLoading, deleteActivity, refreshActivities } =
    useActivities();
  const [filter, setFilter] = useState<FilterType>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );

  const handleToggleExpand = useCallback((activityId: string) => {
    setExpandedActivityId((prev) => (prev === activityId ? null : activityId));
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
    const success = await deleteActivity(id);
    if (success) {
      // Force refresh to ensure UI updates
      await refreshActivities();
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
            ),
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
            {Array.from(groupedActivities.entries()).map(
              ([dateKey, dayActivities]) => (
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
                      <SwipeableActivityCard
                        key={activity.id}
                        activity={activity}
                        isExpanded={expandedActivityId === activity.id}
                        onToggleExpand={() => handleToggleExpand(activity.id)}
                        onEdit={() => handleEdit(activity)}
                        onDelete={() => handleDelete(activity.id)}
                      />
                    ))}
                  </Stack>
                </Box>
              ),
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
