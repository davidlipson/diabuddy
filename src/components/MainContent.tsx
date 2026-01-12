import { ReactNode } from "react";
import { Box } from "@mui/material";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        height: "100%",
      }}
    >
      {children}
    </Box>
  );
}

