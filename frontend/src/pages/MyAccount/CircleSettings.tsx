// frontend/src/pages/MyAccount/CircleSettings.tsx
// My Account → Settings → Circles panel.
// Rows: Neighborhood · Schools · Mutual friends, each with a toggle switch.
// Schools row: chip list with remove (X icon) + autocomplete to add, capped at 2.
// Live CirclePreview at the bottom reflects toggle state.
import { useEffect, useState } from "react";
import { MapPin, GraduationCap, Users } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { type School } from "../../lib/useSchoolSearch";
import { CirclePreview } from "../signup/CirclePreview";
import { PANEL_TITLE } from "./constants";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { SchoolPicker } from "../../components/ui/SchoolPicker";

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

export function CircleSettings() {
  const [summary, setSummary] = useState<CircleSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    apiFetch("/api/circles/me")
      .then((r) => {
        if (!r.ok) {
          console.error("[CircleSettings] /api/circles/me returned", r.status);
          setLoadError(`Couldn't load your circles (HTTP ${r.status}). Try refreshing.`);
          return null;
        }
        return r.json() as Promise<CircleSummary>;
      })
      .then((d) => {
        if (d) setSummary(d);
      })
      .catch((err: unknown) => {
        console.error("[CircleSettings] /api/circles/me network error:", err);
        setLoadError("Couldn't load your circles. Try refreshing.");
      });
  };

  useEffect(load, []);

  if (loadError) {
    return <p className="text-sm text-error">{loadError}</p>;
  }

  if (!summary) {
    return <p className="text-sm text-muted">Loading circles...</p>;
  }

  const patchConsent = (community_id: number, share: boolean) => {
    // Optimistic update: flip the relevant toggle immediately.
    setSummary((prev) => {
      if (!prev) return prev;
      if (prev.neighborhood?.community_id === community_id) {
        return {
          ...prev,
          neighborhood: { ...prev.neighborhood, share },
        };
      }
      return {
        ...prev,
        schools: prev.schools.map((s) =>
          s.community_id === community_id ? { ...s, share } : s,
        ),
      };
    });
    // Fire PATCH in the background; reconcile only on failure.
    apiFetch("/api/circles/consent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ community_id, share }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error("[CircleSettings] PATCH /api/circles/consent failed", res.status);
          load();
        }
      })
      .catch((err: unknown) => {
        console.error("[CircleSettings] PATCH /api/circles/consent network error:", err);
        load();
      });
  };

  const patchMutual = (share: boolean) => {
    // Optimistic update: flip mutual-friends toggle immediately.
    setSummary((prev) => {
      if (!prev) return prev;
      return { ...prev, mutualFriends: { share } };
    });
    // Fire PATCH in the background; reconcile only on failure.
    apiFetch("/api/circles/mutual-friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error("[CircleSettings] PATCH /api/circles/mutual-friends failed", res.status);
          load();
        }
      })
      .catch((err: unknown) => {
        console.error("[CircleSettings] PATCH /api/circles/mutual-friends network error:", err);
        load();
      });
  };

  const addSchool = async (s: School) => {
    const res = await apiFetch("/api/circles/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_id: s.id }),
    });
    if (res.ok) load();
  };

  const removeSchool = async (community_id: number) => {
    await apiFetch(`/api/circles/schools/${community_id}`, { method: "DELETE" });
    load();
  };

  const schoolFull = summary.schools.length >= 2;
  // One toggle controls all school memberships: on if any school has share=true
  const schoolShareOn = summary.schools.some((s) => s.share);

  const handleSchoolToggle = (nextShare: boolean) => {
    // Optimistic update: flip ALL schools at once.
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        schools: prev.schools.map((s) => ({ ...s, share: nextShare })),
      };
    });
    // Fire all PATCHes in parallel; reconcile once only if any fail.
    const patches = summary.schools.map((s) =>
      apiFetch("/api/circles/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: s.community_id, share: nextShare }),
      })
        .then((res) => res.ok)
        .catch((err: unknown) => {
          console.error("[CircleSettings] PATCH school toggle error:", err);
          return false;
        }),
    );
    Promise.all(patches).then((results) => {
      if (results.some((ok) => !ok)) {
        load();
      }
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
          <ToggleSwitch
            checked={summary.neighborhood.share}
            label="Toggle neighborhood visibility"
            onChange={(v) =>
              patchConsent(summary.neighborhood!.community_id, v)
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
          <div className="mt-3 max-w-xs">
            <SchoolPicker
              selected={summary.schools.map((s) => ({ id: s.community_id, name: s.name }))}
              onAdd={addSchool}
              onRemove={removeSchool}
              max={2}
              placeholder="Add a school"
            />
          </div>
        </div>

        {/* Single toggle controls all school memberships */}
        <ToggleSwitch
          checked={schoolShareOn}
          label="Toggle school visibility"
          onChange={handleSchoolToggle}
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
        <ToggleSwitch
          checked={summary.mutualFriends.share}
          label="Toggle mutual friends visibility"
          onChange={(v) => patchMutual(v)}
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
