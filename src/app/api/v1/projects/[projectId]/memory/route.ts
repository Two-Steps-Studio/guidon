import { collectionRoutes } from "@/lib/api/project-resource-routes";

// List and create - see src/lib/api/project-resources.ts.
export const { GET, POST } = collectionRoutes("memory");
