import { Box } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface NavigationArrowProps {
  direction: "left" | "right";
  onClick: () => void;
}

export function NavigationArrow({ direction, onClick }: NavigationArrowProps) {
  const isLeft = direction === "left";

  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: "pointer",
        position: "absolute",
        [isLeft ? "left" : "right"]: 0,
        top: "50%",
        transform: "translateY(-50%)",
        py: 5,
        px: 1,
        opacity: 0.3,
        "&:hover": { opacity: 1 },
        zIndex: 1000,
      }}
    >
      {isLeft ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </Box>
  );
}

