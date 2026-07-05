import { z } from "zod";
import { LEAD_STAGES, LEAD_OUTCOMES } from "@/lib/geo/stages";

// ---- Geofence schemas ----

export const GeofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["client", "office"]),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(1).max(5000),
  notes: z.string().trim().max(1000).nullish(),
});

export const GeofenceUpdateSchema = GeofenceCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type GeofenceCreateInput = z.infer<typeof GeofenceCreateSchema>;
export type GeofenceUpdateInput = z.infer<typeof GeofenceUpdateSchema>;

// ---- Lead schemas ----

export const LeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact_phone: z.string().trim().max(40).nullish(),
  contact_email: z
    .string()
    .trim()
    .email()
    .nullish()
    .or(z.literal("").transform(() => null)),
  company: z.string().trim().max(160).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: z.string().trim().max(500).nullish(),
  assigned_to: z.string().uuid().nullish(),
  stage: z.enum(LEAD_STAGES).default("new"),
  value_inr: z.number().min(0).max(99_999_999.99).nullish(),
  source: z.string().trim().max(80).nullish(),
});

export const LeadUpdateSchema = LeadCreateSchema.partial();

export const StageUpdateSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  note: z.string().trim().max(500).optional(),
});

export const LeadAssignSchema = z.object({
  employee_id: z.string().uuid().nullable(),
});

// ---- Visit schemas ----

export const VisitCreateSchema = z.object({
  lead_id: z.string().uuid(),
  notes: z.string().trim().max(2000).nullish(),
  outcome: z.enum(LEAD_OUTCOMES),
  follow_up_date: z.string().date().nullish(), // YYYY-MM-DD
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

export const VisitUpdateSchema = VisitCreateSchema.partial().omit({ lead_id: true });
