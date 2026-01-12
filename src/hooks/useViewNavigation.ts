import { useState, useCallback } from "react";
import { SETTINGS_COUNT } from "../components/SettingsView";
import { EXPLANATION_SECTIONS } from "../components/ExplanationView";

export interface ViewNavigationState {
  viewIndex: number;
  selectedStat: string | null;
  explanationSection: number;
  settingsOpen: boolean;
  settingIndex: number;
}

export interface ViewNavigationActions {
  handlePrev: () => void;
  handleNext: () => void;
  handleStatClick: (statKey: string) => void;
  handleBackFromExplanation: () => void;
  handleOpenSettings: () => void;
  handleCloseSettings: () => void;
  resetNavigation: () => void;
}

export type UseViewNavigationReturn = ViewNavigationState & ViewNavigationActions;

export function useViewNavigation(numViews: number): UseViewNavigationReturn {
  const [viewIndex, setViewIndex] = useState(0);
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  const [explanationSection, setExplanationSection] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingIndex, setSettingIndex] = useState(0);

  const handleStatClick = useCallback((statKey: string) => {
    setSelectedStat(statKey);
    setExplanationSection(0);
  }, []);

  const handleBackFromExplanation = useCallback(() => {
    setSelectedStat(null);
    setExplanationSection(0);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    setSettingIndex(0);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingIndex(0);
  }, []);

  const handlePrev = useCallback(() => {
    if (settingsOpen) {
      setSettingIndex((i) => (i - 1 + SETTINGS_COUNT) % SETTINGS_COUNT);
    } else if (selectedStat) {
      setExplanationSection(
        (i) => (i - 1 + EXPLANATION_SECTIONS) % EXPLANATION_SECTIONS
      );
    } else if (numViews > 0) {
      setViewIndex((i) => (i - 1 + numViews) % numViews);
    }
  }, [settingsOpen, selectedStat, numViews]);

  const handleNext = useCallback(() => {
    if (settingsOpen) {
      setSettingIndex((i) => (i + 1) % SETTINGS_COUNT);
    } else if (selectedStat) {
      setExplanationSection((i) => (i + 1) % EXPLANATION_SECTIONS);
    } else if (numViews > 0) {
      setViewIndex((i) => (i + 1) % numViews);
    }
  }, [settingsOpen, selectedStat, numViews]);

  const resetNavigation = useCallback(() => {
    setViewIndex(0);
    setSettingsOpen(false);
    setSelectedStat(null);
  }, []);

  return {
    viewIndex,
    selectedStat,
    explanationSection,
    settingsOpen,
    settingIndex,
    handlePrev,
    handleNext,
    handleStatClick,
    handleBackFromExplanation,
    handleOpenSettings,
    handleCloseSettings,
    resetNavigation,
  };
}

