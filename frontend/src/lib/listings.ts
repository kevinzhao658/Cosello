export const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"] as const;
export type Condition = typeof CONDITIONS[number];
