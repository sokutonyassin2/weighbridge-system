import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate short Entry ID (WB-X format)
export const getShortEntryId = (uuid: string, wbNumber?: number): string => {
  if (wbNumber) return `WB-${wbNumber}`;
  if (!uuid) return "N/A";
  return `WB-${uuid.substring(0, 6).toUpperCase()}`; // Fallback for old entries
};
