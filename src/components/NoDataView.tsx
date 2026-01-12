import { Stack, Typography, Button } from "@mui/material";

interface NoDataViewProps {
  onRefresh: () => void;
}

export function NoDataView({ onRefresh }: NoDataViewProps) {
  return (
    <Stack
      spacing={2}
      alignItems="center"
      justifyContent="center"
      height="100vh"
    >
      <Typography variant="body2" color="text.secondary">
        No glucose data available
      </Typography>
      <Button variant="contained" onClick={onRefresh}>
        Refresh
      </Button>
    </Stack>
  );
}

