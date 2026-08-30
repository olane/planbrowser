export function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 30) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes === 1) return '1 minute ago';
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) return '1 hour ago';
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;

  // Fallback to a clean date format for older dates
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(app: { status?: string; furtherInformation?: Record<string, string> }): string {
  const status = app.status || '';
  const decision = app.furtherInformation?.['Decision'] || '';
  if (status.toLowerCase().includes('decided') && decision) {
    const d = decision.toLowerCase();
    if (d.includes('grant') || d.includes('permit') || d.includes('approv')) return 'Permitted';
    if (d.includes('refus')) return 'Refused';
  }
  return status;
}

export function progressText(progress: { message: string; current?: number; total?: number }): string {
  if (progress.total === undefined) return progress.message;
  return `${progress.message} (${progress.current ?? 0}/${progress.total})`;
}

export function statusBadgeClass(app: { status?: string; furtherInformation?: Record<string, string> }): string {
  const label = statusLabel(app).toLowerCase();
  if (label.includes('refus')) return 'bg-red-50 text-red-700 ring-red-600/10';
  if (label.includes('permit') || label.includes('grant')) return 'bg-green-50 text-green-700 ring-green-600/20';
  return 'bg-blue-50 text-blue-700 ring-blue-700/10';
}
