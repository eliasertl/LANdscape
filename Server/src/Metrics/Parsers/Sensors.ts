import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { TemperatureMetric } from '@landscape/shared';

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

function readMilli(file: string): number | null {
  const text = readText(file);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value / 1000 : null;
}

/** Reads temperatures from hwmon (lm-sensors style) under a sysfs root. */
export function readHwmon(sysRoot: string): TemperatureMetric[] {
  const base = path.join(sysRoot, 'class', 'hwmon');
  let devices: string[];
  try {
    devices = readdirSync(base);
  } catch {
    return [];
  }
  const sensors: TemperatureMetric[] = [];
  for (const device of devices) {
    const dir = path.join(base, device);
    const name = readText(path.join(dir, 'name')) ?? device;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = /^temp(\d+)_input$/.exec(entry);
      if (!match) continue;
      const index = match[1] as string;
      const celsius = readMilli(path.join(dir, entry));
      if (celsius === null || celsius < -50 || celsius > 200) continue;
      const label = readText(path.join(dir, `temp${index}_label`)) ?? (entries.some((e) => /^temp\d+_input$/.test(e) && e !== entry) ? `${name} ${index}` : name);
      sensors.push({
        sensor: `${name}/temp${index}`,
        label,
        celsius,
        max: readMilli(path.join(dir, `temp${index}_max`)),
        critical: readMilli(path.join(dir, `temp${index}_crit`)),
      });
    }
  }
  return sensors;
}

/** Reads thermal zones (ARM SoCs, laptops) under a sysfs root. */
export function readThermalZones(sysRoot: string): TemperatureMetric[] {
  const base = path.join(sysRoot, 'class', 'thermal');
  let zones: string[];
  try {
    zones = readdirSync(base).filter((z) => z.startsWith('thermal_zone'));
  } catch {
    return [];
  }
  const sensors: TemperatureMetric[] = [];
  for (const zone of zones) {
    const dir = path.join(base, zone);
    const celsius = readMilli(path.join(dir, 'temp'));
    if (celsius === null || celsius < -50 || celsius > 200) continue;
    const type = readText(path.join(dir, 'type')) ?? zone;
    sensors.push({ sensor: zone, label: type, celsius, max: null, critical: null });
  }
  return sensors;
}

/** Combines hwmon and thermal zones, dropping duplicate labels with equal readings. */
export function readTemperatures(sysRoot: string): TemperatureMetric[] {
  const all = [...readHwmon(sysRoot), ...readThermalZones(sysRoot)];
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = `${s.label.toLowerCase()}:${s.celsius.toFixed(1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
