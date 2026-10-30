import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Адрес раздела сценария: scenarioHref("s_1", "/goals") → «/scenario/goals?id=s_1». */
export function scenarioHref(id: string, tab = "") {
  return `/scenario${tab}?id=${encodeURIComponent(id)}`;
}
