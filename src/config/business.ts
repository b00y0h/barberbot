import fs from 'fs';
import path from 'path';

export interface ServiceItem {
  name: string;
  duration: number;
  price: number;
  description: string;
}

export interface StaffMember {
  name: string;
  role: string;
  specialties: string[];
}

export interface BusinessHours {
  open: string;
  close: string;
}

export interface BusinessProfile {
  name: string;
  type: string;
  phone: string;
  address: string;
  hours: Record<string, BusinessHours | 'closed'>;
  services: ServiceItem[];
  staff: StaffMember[];
  policies: {
    cancellation: string;
    lateness: string;
    payment: string[];
  };
  personality: string;
}

let _profile: BusinessProfile | null = null;

export function loadBusinessProfile(filePath?: string): BusinessProfile {
  if (_profile) return _profile;

  const profilePath = filePath || path.resolve(__dirname, '../../data/business-profiles/classic-cuts.json');

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Business profile not found at ${profilePath}`);
  }

  const raw = fs.readFileSync(profilePath, 'utf-8');
  _profile = JSON.parse(raw) as BusinessProfile;
  console.log(`[Business] Loaded profile: ${_profile.name}`);
  return _profile;
}

export function getBusinessProfile(): BusinessProfile {
  if (!_profile) {
    return loadBusinessProfile();
  }
  return _profile;
}

export function formatServicesForDisplay(services: ServiceItem[]): string {
  return services
    .map(s => `• ${s.name} — $${s.price} (${s.duration} min) — ${s.description}`)
    .join('\n');
}

export function formatHoursForDisplay(hours: Record<string, BusinessHours | 'closed'>): string {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days
    .map(day => {
      const h = hours[day];
      if (h === 'closed') return `• ${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`;
      if (h && typeof h === 'object') return `• ${day.charAt(0).toUpperCase() + day.slice(1)}: ${h.open} – ${h.close}`;
      return `• ${day.charAt(0).toUpperCase() + day.slice(1)}: Unknown`;
    })
    .join('\n');
}
