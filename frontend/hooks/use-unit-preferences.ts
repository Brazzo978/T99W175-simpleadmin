"use client";

import { useEffect, useState } from "react";

// Display units are a per-browser preference: nothing on the modem depends
// on them.
const STORAGE_KEY = "simpleadmin_units";

export interface UnitPreferences {
  tempUnit: "celsius" | "fahrenheit";
  distanceUnit: "km" | "miles";
}

const DEFAULTS: UnitPreferences = { tempUnit: "celsius", distanceUnit: "km" };

export function useUnitPreferences(): UnitPreferences {
  const [prefs, setPrefs] = useState<UnitPreferences>(DEFAULTS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch {
      // Private mode or a corrupt value: keep the defaults.
    }
  }, []);

  return prefs;
}
