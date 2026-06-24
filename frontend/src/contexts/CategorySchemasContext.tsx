/**
 * CategorySchemasContext — provides the fetched /api/categories schemas
 * app-wide so components do not need the `categorySchemas` prop drilled from
 * App.tsx.
 *
 * The schemas are fetched once in App.tsx (unchanged), stored in state there,
 * and exposed here. Consumers call `useCategorySchemas()`.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { CategorySchema } from "../lib/types";

export type CategorySchemasMap = Record<string, CategorySchema>;

const CategorySchemasContext = createContext<CategorySchemasMap>({});

export function CategorySchemasProvider({
  value,
  children,
}: {
  value: CategorySchemasMap;
  children: ReactNode;
}) {
  return (
    <CategorySchemasContext.Provider value={value}>
      {children}
    </CategorySchemasContext.Provider>
  );
}

export function useCategorySchemas(): CategorySchemasMap {
  return useContext(CategorySchemasContext);
}
