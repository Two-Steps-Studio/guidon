import { itemRoutes } from "@/lib/api/project-resource-routes";

// Read, edit and delete one - see src/lib/api/project-resources.ts.
export const { GET, PATCH, DELETE } = itemRoutes("technologies");
