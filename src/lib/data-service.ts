import fs from 'fs';
import path from 'path';

export interface WorkAuthRoute {
  name: string;
  type: string;
  sponsorship_required: boolean;
  processing_time_months: { min: number; max: number };
  salary_minimum_eur?: number;
  salary_minimum_gbp?: number;
  eligibility_criteria: string[];
  data_confidence: string;
}

export interface DestinationRoleData {
  destination: string;
  role_slug: string;
  role_display_name: string;
  last_updated: string;
  salary: {
    currency_code: string;
    min: number;
    median: number;
    max: number;
    sponsorship_minimum_threshold: number;
    data_confidence: string;
  };
  work_authorisation_routes: WorkAuthRoute[];
  credentials: {
    required_qualifications: string[];
    language_requirements: string[];
    degree_equivalency_notes: string;
    data_confidence: string;
  };
  timeline: {
    typical_hiring_duration_months: { min: number; max: number };
    fastest_auth_processing_months: number;
    slowest_auth_processing_months: number;
    total_estimated_time_to_start_months: { min: number; max: number };
    data_confidence: string;
  };
  market_demand: {
    level: string;
    demand_scale_definition: string;
    notes: string;
    data_confidence: string;
  };
}

export interface DestinationIndex {
  supported_combinations: Array<{
    destination_slug: string;
    destination_display_name: string;
    currency_code: string;
    roles: Array<{ slug: string; display_name: string }>;
  }>;
}

const dataPath = path.join(process.cwd(), 'data', 'destinations');
let index: DestinationIndex | null = null;

function loadIndex(): DestinationIndex {
  if (index) return index;
  index = JSON.parse(fs.readFileSync(path.join(dataPath, 'index.json'), 'utf-8')) as DestinationIndex;
  return index;
}

export function getIndex(): DestinationIndex {
  return loadIndex();
}

export function getSupportedRolesForDestination(destination: string): Array<{ slug: string; display_name: string }> | null {
  const entry = loadIndex().supported_combinations.find((c) => c.destination_slug === destination);
  return entry ? entry.roles : null;
}

export function getDestinationRoleData(destinationSlug: string, roleSlug: string): DestinationRoleData | null {
  const idx = loadIndex();
  const combo = idx.supported_combinations.find((c) => c.destination_slug === destinationSlug);
  if (!combo) return null;
  const role = combo.roles.find((r) => r.slug === roleSlug);
  if (!role) return null;

  const filePath = path.join(dataPath, destinationSlug, `${roleSlug}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DestinationRoleData;
}
