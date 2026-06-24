import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { ToggleSwitch } from "../../../components/ui/ToggleSwitch";
import { CircleSettings } from "../CircleSettings";
import { FOCUS_RING, SEG_BTN_BASE, PANEL_TITLE } from "../constants";
import type { Settings } from "../../../contexts/SettingsContext";
import { useMyAccount } from "../MyAccountContext";

export interface SettingsTabContentProps {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  resetSettings: () => void;
  friendsCount: number;
  logout: () => Promise<void>;
}

function SettingRow({ title, subtitle, control }: { title: string; subtitle: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsTabContent({
  settings,
  updateSetting,
  resetSettings,
  friendsCount,
  logout,
}: SettingsTabContentProps) {
  const { openEditProfileModal, openAddFriendsModal, openFriendsModal } = useMyAccount();

  const fontSizes: [Settings["fontSize"], string][] = [
    ["default", "Default"],
    ["large", "Large"],
    ["extra-large", "Extra large"],
  ];
  const colorBlindModes: [Settings["colorBlindMode"], string][] = [
    ["off", "Off"],
    ["protanopia", "Protanopia"],
    ["deuteranopia", "Deuteranopia"],
    ["tritanopia", "Tritanopia"],
  ];

  // Reset-to-default uses an inline two-stage confirm: first click swaps
  // the button into Confirm/Cancel pair, auto-reverting after 3s so a
  // stray click can never wipe settings without intent. Confirmed reset
  // shows a 2s "Settings reset." inline note.
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetNoticeVisible, setResetNoticeVisible] = useState(false);
  useEffect(() => {
    if (!resetConfirming) return;
    const t = setTimeout(() => setResetConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [resetConfirming]);
  useEffect(() => {
    if (!resetNoticeVisible) return;
    const t = setTimeout(() => setResetNoticeVisible(false), 2000);
    return () => clearTimeout(t);
  }, [resetNoticeVisible]);
  const handleResetConfirm = () => {
    resetSettings();
    setResetConfirming(false);
    setResetNoticeVisible(true);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className={`text-base ${PANEL_TITLE}`}>General</h3>
          <div className="flex items-center gap-2">
            {resetNoticeVisible && (
              <span className="text-xs text-muted" role="status" aria-live="polite">
                Settings reset.
              </span>
            )}
            {resetConfirming ? (
              <>
                <button
                  type="button"
                  onClick={handleResetConfirm}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => setResetConfirming(false)}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md text-muted hover:text-ink text-xs font-semibold ${FOCUS_RING}`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setResetConfirming(true)}
                className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted mb-4">Restore every device setting on this page to its default value.</p>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Accessibility</h3>
        <p className="text-sm text-muted mb-4">Stored on this device, applied across Cosello.</p>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Text size</p>
              <p className="text-xs text-muted mt-0.5">Adjust body text size used throughout Cosello.</p>
            </div>
            <div role="radiogroup" aria-label="Text size" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md shrink-0">
              {fontSizes.map(([v, label]) => {
                const active = settings.fontSize === v;
                return (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSetting("fontSize", v)}
                    className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <SettingRow
            title="Reduce motion"
            subtitle="Disable transitions and incidental animation."
            control={<ToggleSwitch checked={settings.reduceMotion} onChange={(v) => updateSetting("reduceMotion", v)} label="Reduce motion" />}
          />
          <SettingRow
            title="High contrast"
            subtitle="Increase contrast on muted text and borders."
            control={<ToggleSwitch checked={settings.highContrast} onChange={(v) => updateSetting("highContrast", v)} label="High contrast" />}
          />
          <SettingRow
            title="Compact mode"
            subtitle="Tighten spacing across cards, sections, and layouts."
            control={<ToggleSwitch checked={settings.compactMode} onChange={(v) => updateSetting("compactMode", v)} label="Compact mode" />}
          />
          {/* Dark mode sets data-theme="dark" on <html>; SettingsContext
              persists the choice to localStorage and restores on reload.
              The Electric Violet token set (UI redesign v3) fully supports
              dark mode via the [data-theme="dark"] block in theme.css. */}
          <SettingRow
            title="Dark mode"
            subtitle="Use a dark surface palette across Cosello."
            control={<ToggleSwitch checked={settings.darkMode} onChange={(v) => updateSetting("darkMode", v)} label="Dark mode" />}
          />
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Color-blind mode</p>
              <p className="text-xs text-muted mt-0.5">Substitute accent hues with palette-safe alternates.</p>
            </div>
            <div role="radiogroup" aria-label="Color-blind mode" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md shrink-0">
              {colorBlindModes.map(([v, label]) => {
                const active = settings.colorBlindMode === v;
                return (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSetting("colorBlindMode", v)}
                    className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Friends</h3>
        <p className="text-sm text-muted mb-4">Manage your friend connections.</p>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <SettingRow
            title="Friends"
            subtitle={`${friendsCount} ${friendsCount === 1 ? "friend" : "friends"}`}
            control={
              <div className="flex items-center gap-2">
                <button
                  onClick={openFriendsModal}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
                >
                  View
                </button>
                <button
                  onClick={openAddFriendsModal}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Add friends
                </button>
              </div>
            }
          />
        </div>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Circles</h3>
        <p className="text-sm text-muted mb-4">Control which trust signals appear on your listings.</p>
        <CircleSettings />
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Account</h3>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <SettingRow
            title="Edit profile"
            subtitle="Name, photo, neighborhood, and pickup address."
            control={
              <button
                onClick={openEditProfileModal}
                className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
              >
                Edit
              </button>
            }
          />
          <SettingRow
            title="Log out"
            subtitle="Sign out of Cosello on this device."
            control={
              <button
                onClick={logout}
                className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-error/40 text-error bg-canvas hover:bg-error/5 text-xs font-semibold ${FOCUS_RING}`}
              >
                <LogOut className="size-3.5" />
                Log out
              </button>
            }
          />
        </div>
      </section>
    </div>
  );
}
