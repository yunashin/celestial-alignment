import { useReducer } from "react";
import type { GameState } from "../types";
import { gameReducer } from "../engine/reducer";

export function useGameEngine() {
  const [state, dispatch] = useReducer(gameReducer, { phase: "setup" } as GameState);
  return { state, dispatch };
}
