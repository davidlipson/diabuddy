import { Stack, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { statExplanations } from "../lib/statExplanations";
import { usePlatform } from "../context";

interface ExplanationViewProps {
  statKey: string;
  sectionIndex: number;
  onBack: () => void;
}

export const EXPLANATION_SECTIONS = 3; // description, howToUse, example

export function ExplanationView({
  statKey,
  sectionIndex,
  onBack,
}: ExplanationViewProps) {
  const { isMobile } = usePlatform();
  const explanation = statExplanations[statKey];

  // Safe area offsets for mobile - equidistant from edges
  const topOffset = isMobile ? `calc(env(safe-area-inset-top, 0px) + 32px)` : 8;
  const leftOffset = isMobile ? `calc(env(safe-area-inset-left, 0px) + 16px)` : 8;
  const iconSize = isMobile ? "1.5rem" : "1rem";

  const sections = [
    {
      title: "What it measures",
      content: explanation.description,
    },
    {
      title: "How to use it",
      content: explanation.howToUse,
    },
    {
      title: "Example",
      content: explanation.example,
    },
  ];

  const currentSection = sections[sectionIndex] || sections[0];

  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        py: isMobile ? 4 : 1,
        px: isMobile ? 4 : 2,
        position: "relative",
        justifyContent: isMobile ? "center" : "flex-start",
      }}
      spacing={isMobile ? 3 : 1}
    >
      <CloseOutlinedIcon
        onClick={onBack}
        sx={{
          position: "absolute",
          top: topOffset,
          left: leftOffset,
          fontSize: iconSize,
          cursor: "pointer",
          opacity: isMobile ? 0.6 : 0.3,
          "&:hover": { opacity: 1 },
          zIndex: 1000,
        }}
      />

      <Stack alignItems="center">
        <Typography
          variant={isMobile ? "h6" : "body2"}
          fontWeight={600}
        >
          {explanation.name}
        </Typography>
      </Stack>

      <Stack px={isMobile ? 2 : 3} width="100%" alignItems="center">
        <Typography
          variant={isMobile ? "body1" : "body2"}
          color="text.secondary"
          sx={{
            textAlign: isMobile ? "center" : "left",
            maxWidth: isMobile ? 320 : "100%",
            lineHeight: 1.6,
          }}
        >
          {currentSection.content}
        </Typography>
      </Stack>
    </Stack>
  );
}
