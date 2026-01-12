import { Stack, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { statExplanations } from "../lib/statExplanations";

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
  const explanation = statExplanations[statKey];

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
      sx={{ width: "100%", height: "100%", py: 1, px: 2, position: "relative" }}
      spacing={1}
    >
      <CloseOutlinedIcon
        onClick={onBack}
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

      <Stack alignItems="center">
        <Typography variant="body2" fontWeight={600}>
          {explanation.name}
        </Typography>
      </Stack>

      <Stack px={3} width="100%">
        <Typography variant="body2" color="text.secondary">
          {currentSection.content}
        </Typography>
      </Stack>
    </Stack>
  );
}
