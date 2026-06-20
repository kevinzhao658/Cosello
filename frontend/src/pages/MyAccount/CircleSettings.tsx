// frontend/src/pages/MyAccount/CircleSettings.tsx
// My Account → Settings → Circles panel.
// Rows: Neighborhood · Schools · Mutual friends, each with a toggle switch.
// Schools row: chip list with remove (X icon) + autocomplete to add, capped at 2.
// Live CirclePreview at the bottom reflects toggle state.
import { useEffect, useState } from "react";
import { MapPin, GraduationCap, Users, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useSchoolSearch, type School } from "../../lib/useSchoolSearch";
import { CirclePreview } from "../signup/CirclePreview";
import { FOCUS_RING, PANEL_TITLE } from "./constants";

interface CircleSchool {
  community_id: number;
  name: string;
  share: boolean;
}

interface CircleSummary {
  neighborhood: { community_id: number; label: string; share: boolean } | null;
  schools: CircleSchool[];
  mutualFriends: { share: boolean };
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-safe:duration-150 ${FOCUS_RING} ${on ? "bg-primary" : "bg-surface-strong"}`}
    >
      <span
        className={`inline-block size-5 transform rounded-full bg-canvas shadow-card transition-transform motion-safe:duration-150 ${on ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function CircleSettings() {
  const [summary, setSummary] = useState<CircleSummary | null>(null);
  const [query, setQuery] = useState("");
  const results = useSchoolSearch(query).filter(
    (r) => !summary?.schools.some((s) => s.name === r.name),
  );

  const load = () => {
    apiFetch("/api/circles/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CircleSummary | null) => {
        if (d) setSummary(d);
      })
      .catch(() => {});
  };

  useEffect(load, []);

  if (!summary) {
    return <p className="text-sm text-muted">Loading circles...</p>;
  }

  const patchConsent = async (community_id: number, share: boolean) => {
    await apiFetch("/api/circles/consent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ community_id, share }),
    });
    load();
  };

  const patchMutual = async (share: boolean) => {
    await apiFetch("/api/circles/mutual-friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share }),
    });
    load();
  };

  const addSchool = async (s: School) => {
    const res = await apiFetch("/api/circles/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_id: s.id }),
    });
    if (res.ok) {
      setQuery("");
      load();
    }
  };

  const removeSchool = async (community_id: number) => {
    await apiFetch(`/api/circles/schools/${community_id}`, { method: "DELETE" });
    load();
  };

  const schoolFull = summary.schools.length >= 2;
  // One toggle controls all school memberships: on if any school has share=true
  const schoolShareOn = summary.schools.some((s) => s.share);

  const handleSchoolToggle = () => {
    const nextShare = !schoolShareOn;
    summary.schools.forEach((s) => {
      patchConsent(s.community_id, nextShare);
    });
  };

  return (
    <div className="border border-hairline rounded-md p-5 space-y-1">
      <h3 className={`text-base ${PANEL_TITLE}`}>Circles</h3>
      <p className="text-xs text-muted">
        Opting in will activate your circle when mutuals view your listings. Opting out will leave your circle permanently faded, even if a mutual views your listings.
      </p>

      {/* Neighborhood row */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline mt-3">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0">
          <MapPin className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Neighborhood</div>
          <div className="text-xs text-muted">
            {summary.neighborhood?.label
              ? `Shown as "${summary.neighborhood.label}".`
              : "Shown to others in your neighborhood."}
          </div>
        </div>
        {summary.neighborhood ? (
          <Toggle
            on={summary.neighborhood.share}
            label="Toggle neighborhood visibility"
            onClick={() =>
              patchConsent(
                summary.neighborhood!.community_id,
                !summary.neighborhood!.share,
              )
            }
          />
        ) : (
          <span className="text-xs text-muted-soft">No address set</span>
        )}
      </div>

      {/* Schools row */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0">
          <GraduationCap className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Schools</div>
          <div className="text-xs text-muted">Up to 2. Shown to anyone from the same school.</div>

          {/* School chips */}
          {summary.schools.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {summary.schools.map((s) => (
                <span
                  key={s.community_id}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full pl-3 pr-1.5 py-1"
                >
                  {s.name}
                  <button
                    type="button"
                    onClick={() => removeSchool(s.community_id)}
                    aria-label={`Remove ${s.name}`}
                    className={`size-[18px] rounded-full bg-surface-strong text-muted hover:text-ink flex items-center justify-center ${FOCUS_RING}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add school autocomplete */}
          {!schoolFull && (
            <div className="relative mt-3 max-w-xs">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Add a school"
                className={`w-full text-sm text-ink px-3 py-2 border border-border-strong rounded-sm bg-canvas focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow] ${FOCUS_RING}`}
              />
              {results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border border-hairline bg-canvas shadow-overlay">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addSchool(r)}
                      className={`w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft ${FOCUS_RING}`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {schoolFull && (
            <p className="text-[11px] text-muted-soft mt-2">
              Maximum of 2 schools. Remove one to add another.
            </p>
          )}
        </div>

        {/* Single toggle controls all school memberships */}
        <Toggle
          on={schoolShareOn}
          label="Toggle school visibility"
          onClick={handleSchoolToggle}
        />
      </div>

      {/* Mutual friends row */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0">
          <Users className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Mutual friends</div>
          <div className="text-xs text-muted">
            Show people you both know on your listings.
          </div>
        </div>
        <Toggle
          on={summary.mutualFriends.share}
          label="Toggle mutual friends visibility"
          onClick={() => patchMutual(!summary.mutualFriends.share)}
        />
      </div>

      {/* Live preview */}
      <div className="border-t border-hairline pt-4">
        <p className="text-xs font-semibold text-muted mb-2">How mutuals will see your listings:</p>
        <CirclePreview
          neighborhood={!!summary.neighborhood?.share}
          school={schoolShareOn}
          mutualFriends={summary.mutualFriends.share}
        />
      </div>
    </div>
  );
}
