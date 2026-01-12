import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

interface TopControlsProps {
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function TopControls({ onRefresh, onOpenSettings }: TopControlsProps) {
  return (
    <>
      <RefreshIcon
        onClick={onRefresh}
        sx={{
          position: "absolute",
          top: 8,
          left: 8,
          fontSize: "1rem",
          cursor: "pointer",
          opacity: 0.3,
          "&:hover": { opacity: 1 },
          zIndex: 1000,
        }}
      />
      <SettingsOutlinedIcon
        onClick={onOpenSettings}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          fontSize: "1rem",
          cursor: "pointer",
          opacity: 0.3,
          "&:hover": { opacity: 1 },
          zIndex: 1000,
        }}
      />
    </>
  );
}

