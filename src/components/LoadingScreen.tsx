import { Box, Stack, CircularProgress } from "@mui/material";
import { WINDOW, GRADIENT_BACKGROUND } from "../lib/constants";

export function LoadingScreen() {
  return (
    <Box
      sx={{
        width: WINDOW.EXPANDED_WIDTH,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: GRADIENT_BACKGROUND,
      }}
    >
      <Stack spacing={2} alignItems="center" justifyContent="center" flex={1}>
        <CircularProgress size={32} />
      </Stack>
    </Box>
  );
}

