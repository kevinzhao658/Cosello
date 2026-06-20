import { CircleByline } from "../../components/CircleByline";

interface CirclePreviewProps {
  /** Show a sample connection medal (1st) in the preview. */
  connection?: boolean;
  /** Show a sample school; bold when the viewer "shares" it. */
  school?: boolean;
}

/** Settings/signup preview of how a listing byline will look. */
export function CirclePreview({ connection = false, school = false }: CirclePreviewProps) {
  return (
    <div className="rounded-lg border border-hairline p-3 max-w-[220px]">
      <CircleByline
        circles={{
          connection: { degree: connection ? 1 : null },
          school: school
            ? { shortName: "Columbia", fullName: "Columbia University", isMine: true }
            : null,
        }}
      />
      <div className="aspect-square bg-surface-soft rounded-md" />
      <p className="text-sm font-medium text-ink mt-2">Sample listing</p>
      <p className="text-xs text-muted">Chelsea · 0.4 mi</p>
      <p className="text-base font-semibold text-ink">$48</p>
    </div>
  );
}
