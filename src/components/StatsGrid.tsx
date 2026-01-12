import { Box } from "@mui/material";
import { ReactNode } from "react";

interface StatsGridProps {
  children: ReactNode;
}

export function StatsGrid({ children }: StatsGridProps) {
  return (
    <Box
      sx={{
        width: "80%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: 1,
        p: 2,
      }}
    >
      {children}
    </Box>
  );
}
