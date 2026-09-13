export function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function inr(n) {
  // Non-breaking space between ₹ and amount so browsers don't wrap them apart
  return `₹ ${money(n)}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function statusBadgeClass(status) {
  switch (status) {
    case 'Sent':
      return 'badge-sent';
    case 'Accepted':
      return 'badge-accepted';
    case 'Rejected':
      return 'badge-rejected';
    case 'Expired':
      return 'badge-expired';
    default:
      return 'badge-draft';
  }
}
