import { format, addDays, subDays } from "date-fns";

/**
 * Night shift spans across two calendar days:
 * - Night shift for "Dec 8" runs from Dec 7 18:00 to Dec 8 07:00
 * - We store night shifts with the DATE they END (the morning date)
 * 
 * This utility provides consistent date/time handling for night shifts.
 */

export interface ShiftTimeWindow {
  startTime: string; // ISO string with timezone
  endTime: string;   // ISO string with timezone
}

/**
 * Get the time window for a specific shift
 * @param shiftDate - The date to query (YYYY-MM-DD)
 * @param shiftName - "Day" or "Night"
 * @returns Start and end times for the shift in UTC+3
 */
export function getShiftTimeWindow(shiftDate: string, shiftName: "Day" | "Night"): ShiftTimeWindow {
  if (shiftName === "Day") {
    // Day shift: 07:00 to 18:00 on the same day
    return {
      startTime: `${shiftDate}T07:00:00+03:00`,
      endTime: `${shiftDate}T18:00:00+03:00`,
    };
  } else {
    // Night shift: 18:00 on previous day to 07:00 on selected day
    const previousDay = format(subDays(new Date(shiftDate), 1), "yyyy-MM-dd");
    return {
      startTime: `${previousDay}T18:00:00+03:00`,
      endTime: `${shiftDate}T07:00:00+03:00`,
    };
  }
}

/**
 * Get the current shift name based on current hour
 */
export function getCurrentShiftName(): "Day" | "Night" {
  const currentHour = new Date().getHours();
  return currentHour >= 7 && currentHour < 18 ? "Day" : "Night";
}

/**
 * Get the shift date for the current shift
 * Night shift spanning two calendar days is assigned to the date it ENDS (morning date)
 * - For day shift (07:00-17:59): today's date
 * - For night shift evening (18:00-23:59): tomorrow's date (shift ends tomorrow morning)
 * - For night shift morning (00:00-06:59): today's date (shift ends today morning)
 */
export function getCurrentShiftDate(): string {
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= 7 && currentHour < 18) {
    // Day shift - use today
    return format(now, "yyyy-MM-dd");
  } else if (currentHour >= 18) {
    // Night shift evening portion (18:00-23:59) - shift ends TOMORROW morning
    return format(addDays(now, 1), "yyyy-MM-dd");
  } else {
    // Night shift morning portion (00:00-06:59) - shift ends TODAY morning
    return format(now, "yyyy-MM-dd");
  }
}

/**
 * Format shift date for display
 */
export function formatShiftDisplay(shiftDate: string, shiftName: string): string {
  const date = new Date(shiftDate);
  const formattedDate = format(date, "MMM dd");
  
  if (shiftName === "Night") {
    const previousDay = format(subDays(date, 1), "MMM dd");
    return `${previousDay} 18:00 - ${formattedDate} 07:00`;
  }
  
  return `${formattedDate} 07:00 - 18:00`;
}

/**
 * Get a human-readable description of the shift time window
 */
export function getShiftTimeDescription(shiftDate: string, shiftName: "Day" | "Night"): string {
  const date = new Date(shiftDate);
  const formattedDate = format(date, "MMM dd, yyyy");
  
  if (shiftName === "Night") {
    const previousDay = format(subDays(date, 1), "MMM dd");
    return `Night shift covers ${previousDay} at 18:00 through ${format(date, "MMM dd")} at 07:00`;
  }
  
  return `Day shift covers ${formattedDate} from 07:00 to 18:00`;
}
