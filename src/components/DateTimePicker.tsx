import { Box, Stack, TextField } from "@mui/material";

interface DateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
}

const inputStyle = {
  "& .MuiOutlinedInput-root": {
    color: "white",
    fontSize: 14,
    "& fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.3)" },
    "&.Mui-focused fieldset": { borderColor: "#1976d2" },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    "&.Mui-focused": { color: "#1976d2" },
  },
  "& .MuiInputBase-input": {
    color: "white",
    "&::-webkit-calendar-picker-indicator": {
      filter: "invert(1)",
      opacity: 0.5,
      cursor: "pointer",
    },
  },
};

export function DateTimePicker({
  value,
  onChange,
  label,
}: DateTimePickerProps) {
  const now = new Date();

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [year, month, day] = e.target.value.split("-").map(Number);
    if (year && month && day) {
      const newDate = new Date(value);
      newDate.setFullYear(year, month - 1, day);
      // Clamp to now if in the future
      if (newDate > now) {
        onChange(now);
      } else {
        onChange(newDate);
      }
      // Blur to close the native picker
      e.target.blur();
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDate = new Date(value);
      newDate.setHours(hours, minutes);
      // Clamp to now if in the future
      if (newDate > new Date()) {
        onChange(new Date());
      } else {
        onChange(newDate);
      }
    }
  };

  // Format date as YYYY-MM-DD for input
  const dateValue = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  // Format time as HH:MM for input
  const timeValue = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

  // Max date is today
  const maxDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Check if selected date is today
  const isToday =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();

  // Max time is current time if date is today
  const maxTime = isToday
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : undefined;

  return (
    <Box sx={{ width: "100%" }}>
      {label && (
        <Box
          sx={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            mb: 0.75,
          }}
        >
          {label}
        </Box>
      )}
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="date"
          value={dateValue}
          onChange={handleDateChange}
          size="small"
          inputProps={{ max: maxDate }}
          sx={{ ...inputStyle, flex: 1 }}
        />
        <TextField
          type="time"
          value={timeValue}
          onChange={handleTimeChange}
          size="small"
          inputProps={{ max: maxTime }}
          sx={{ ...inputStyle, width: 120 }}
        />
      </Stack>
    </Box>
  );
}
