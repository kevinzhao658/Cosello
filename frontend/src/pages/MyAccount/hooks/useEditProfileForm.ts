import { useState, useMemo } from "react";

/**
 * Manages the edit-profile form field cluster for the EditProfileModal.
 *
 * Owns: editFirstName, editLastName, editPickupAddress, editNeighborhood,
 * editZipCode, editShowSuggestions, editProfileError, isUpdatingProfile.
 * Derives: filteredNeighborhoods, isValidNeighborhood (memoized).
 *
 * The caller keeps the full neighborhoods list and passes it in so this hook
 * stays pure — no API fetching. The hook does NOT own the modal-open boolean
 * (showEditProfileModal) because that state also controls the neighborhood-
 * change confirm dialog sequencing in MyAccountPage.
 */
export interface EditProfileFormFields {
  firstName: string;
  lastName: string;
  pickupAddress: string;
  neighborhood: string;
  zipCode: string;
  showSuggestions: boolean;
}

export interface UseEditProfileFormResult {
  fields: EditProfileFormFields;
  setField: <K extends keyof EditProfileFormFields>(key: K, value: EditProfileFormFields[K]) => void;
  /** True when neighborhood input exactly matches a known neighborhood (case-insensitive). */
  isValidNeighborhood: boolean;
  /** Neighborhoods filtered by the current neighborhood input value. */
  filteredNeighborhoods: readonly string[];
  /** Reset all fields to values derived from the provided initial data. */
  reset: (init: { displayName: string; neighborhood: string; pickupAddress: string; zipCode: string }) => void;
  error: string;
  setError: (msg: string) => void;
  pending: boolean;
  setPending: (v: boolean) => void;
}

export function useEditProfileForm(neighborhoods: readonly string[]): UseEditProfileFormResult {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const isValidNeighborhood = useMemo(
    () => neighborhoods.some((n) => n.toLowerCase() === neighborhood.trim().toLowerCase()),
    [neighborhoods, neighborhood],
  );

  const filteredNeighborhoods = useMemo(
    () =>
      neighborhood.trim()
        ? neighborhoods.filter((n) => n.toLowerCase().includes(neighborhood.trim().toLowerCase()))
        : neighborhoods,
    [neighborhoods, neighborhood],
  );

  const fields: EditProfileFormFields = {
    firstName,
    lastName,
    pickupAddress,
    neighborhood,
    zipCode,
    showSuggestions,
  };

  function setField<K extends keyof EditProfileFormFields>(key: K, value: EditProfileFormFields[K]): void {
    switch (key) {
      case "firstName": setFirstName(value as string); break;
      case "lastName": setLastName(value as string); break;
      case "pickupAddress": setPickupAddress(value as string); break;
      case "neighborhood": setNeighborhood(value as string); break;
      case "zipCode": setZipCode(value as string); break;
      case "showSuggestions": setShowSuggestions(value as boolean); break;
    }
  }

  function reset(init: { displayName: string; neighborhood: string; pickupAddress: string; zipCode: string }): void {
    const parts = init.displayName.split(" ");
    setFirstName(parts[0] || "");
    setLastName(parts.slice(1).join(" ") || "");
    setPickupAddress(init.pickupAddress);
    setNeighborhood(init.neighborhood);
    setZipCode(init.zipCode);
    setError("");
    setShowSuggestions(false);
  }

  return {
    fields,
    setField,
    isValidNeighborhood,
    filteredNeighborhoods,
    reset,
    error,
    setError,
    pending,
    setPending,
  };
}
