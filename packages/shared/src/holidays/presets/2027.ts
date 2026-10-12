import type { HolidayPreset } from "../presets";

// National: DoPT O.M. F.No.12/2/2023-JCA dated 16-07-2026 — gazetted (Delhi/New
//   Delhi) and restricted holidays for 2027.
//   https://www.staffnews.in/2026/07/list-of-holidays-for-the-year-2027-gazetted.html
//   https://www.staffnews.in/2026/07/list-of-restricted-holidays-for-the-year-2027.html
// Maharashtra 2027: not yet notified by GAD (as of 2026-10-07) — add when it is.

const g = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "gazetted", name, date });
const r = (name: string, date: string): HolidayPreset => ({ region: "national", kind: "restricted", name, date });

export const PRESETS_2027: HolidayPreset[] = [
  g("Republic Day", "2027-01-26"),
  g("Id-ul-Fitr", "2027-03-10"),
  g("Holi", "2027-03-23"),
  g("Good Friday", "2027-03-26"),
  g("Ram Navami", "2027-04-15"),
  g("Mahavir Jayanti", "2027-04-19"),
  g("Id-ul-Zuha (Bakrid)", "2027-05-17"),
  g("Buddha Purnima", "2027-05-20"),
  g("Muharram", "2027-06-16"),
  g("Independence Day", "2027-08-15"),
  g("Milad-un-Nabi", "2027-08-15"),
  g("Janmashtami (Vaishnav)", "2027-08-25"),
  g("Mahatma Gandhi's Birthday", "2027-10-02"),
  g("Dussehra (Vijaya Dashmi)", "2027-10-09"),
  g("Diwali (Deepavali)", "2027-10-29"),
  g("Guru Nanak's Birthday", "2027-11-14"),
  g("Christmas Day", "2027-12-25"),

  r("New Year's Day", "2027-01-01"),
  r("Makar Sankranti / Magha Bihu", "2027-01-14"),
  r("Pongal / Guru Gobind Singh's Birthday", "2027-01-15"),
  r("Basant Panchami / Sri Panchami", "2027-02-11"),
  r("Shivaji Jayanti", "2027-02-19"),
  r("Guru Ravi Das's Birthday", "2027-02-20"),
  r("Swami Dayananda Saraswati's Birthday", "2027-03-02"),
  r("Jamat-ul-Vida", "2027-03-05"),
  r("Maha Shivratri", "2027-03-06"),
  r("Holika Dahan / Dolyatra", "2027-03-22"),
  r("Easter Sunday", "2027-03-28"),
  r("Chaitra Sukladi / Gudi Padwa / Ugadi / Cheti Chand", "2027-04-07"),
  r("Vaisakhi / Vishu / Meshadi (Tamil New Year)", "2027-04-14"),
  r("Vaisakhadi (Bengal) / Bahag Bihu (Assam)", "2027-04-15"),
  r("Guru Rabindranath Tagore's Birthday", "2027-05-09"),
  r("Rath Yatra", "2027-07-05"),
  r("Parsi New Year / Navroz", "2027-08-15"),
  r("Raksha Bandhan", "2027-08-17"),
  r("Ganesh Chaturthi / Vinayaka Chaturthi", "2027-09-04"),
  r("Onam", "2027-09-12"),
  r("Dussehra (Saptami)", "2027-10-06"),
  r("Dussehra (Mahashtami)", "2027-10-07"),
  r("Dussehra (Mahanavmi)", "2027-10-08"),
  r("Maharishi Valmiki's Birthday", "2027-10-15"),
  r("Karva Chauth", "2027-10-18"),
  r("Naraka Chaturdasi", "2027-10-28"),
  r("Govardhan Puja", "2027-10-30"),
  r("Bhai Duj", "2027-10-31"),
  r("Chhath Puja", "2027-11-04"),
  r("Guru Teg Bahadur's Martyrdom Day", "2027-11-24"),
  r("Hazarat Ali's Birthday", "2027-12-12"),
  r("Christmas Eve", "2027-12-24"),
];
