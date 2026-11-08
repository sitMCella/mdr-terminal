interface CompleteScreenProps {
  fileName: string;
  startedAt: string;
  completedAt: string | null;
  onNewFile: () => void;
}

export function CompleteScreen({ fileName, startedAt, completedAt, onNewFile }: CompleteScreenProps) {
  return (
    <div
      className="overlay overlay--center"
      data-testid="complete-screen"
      role="dialog"
      aria-labelledby="complete-title"
    >
      <div className="card card--center">
        <p className="eyebrow">File complete</p>
        <h1 id="complete-title">{fileName}</h1>
        <p className="big-percent">100%</p>
        <p className="muted">Every bin is full. Time on file: {formatDuration(startedAt, completedAt)}.</p>
        <button type="button" className="btn btn--primary" onClick={onNewFile} autoFocus>
          Open next file
        </button>
      </div>
    </div>
  );
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
