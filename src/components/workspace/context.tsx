"use client";

import { createContext, useContext } from "react";
import type { CrashTestResult, ModelInput } from "@/lib/engine";
import type { SavedScenario } from "@/lib/store";

export interface WorkspaceValue {
  scenario: SavedScenario;
  model: ModelInput;
  setModel: (m: ModelInput) => void;
  result: CrashTestResult;
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error("useWorkspace вне WorkspaceContext");
  return v;
}
