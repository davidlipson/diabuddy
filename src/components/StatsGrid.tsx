import { Box } from "@mui/material";
import { ReactNode } from "react";
import { usePlatform } from "../context";

interface StatsGridProps {
  children: ReactNode;
}

export function StatsGrid({ children }: StatsGridProps) {
  const { isMobile } = usePlatform();

  return (
    <Box
      sx={{
        width: isMobile ? "100%" : "80%",
        height: isMobile ? "auto" : "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        // On mobile: auto rows with square aspect ratio handled by children
        // On desktop: fill available height
        gridTemplateRows: isMobile ? "auto auto" : "1fr 1fr",
        gap: isMobile ? 2 : 1,
        p: isMobile ? 3 : 2,
        alignContent: isMobile ? "center" : "stretch",
      }}
    >
      {children}
    </Box>
  );
}
