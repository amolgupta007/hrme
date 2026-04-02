import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = "support@jambahr.com";       // transactional (leave, docs, training)
export const NOREPLY_EMAIL = "noreply@jambahr.com";    // system / automated (crons, webhooks)
export const FOUNDER_EMAIL_FROM = "amol@jambahr.com";  // personal-feel emails (welcome, founder alerts)
