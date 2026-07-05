export function maskPAN(pan: string | null): string {
  if (!pan || pan.length < 5) return pan ?? "—";
  return "*".repeat(pan.length - 4) + pan.slice(-4);
}

export function maskAadhar(aadhar: string | null): string {
  if (!aadhar) return "—";
  const digits = aadhar.replace(/\D/g, "");
  if (digits.length < 4) return aadhar;
  return "XXXX XXXX " + digits.slice(-4);
}

export function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months--;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) { years--; months += 12; }
  return `${years}y ${months}m ${days}d`;
}
