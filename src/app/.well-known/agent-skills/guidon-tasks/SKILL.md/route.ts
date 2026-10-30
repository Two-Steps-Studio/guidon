import { skillMarkdown } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** The guidon-tasks skill - the same text agent-plugin/skills/guidon-tasks/SKILL.md ships. */
export function GET(request: Request) {
  return discoveryResponse(request, skillMarkdown(SITE_URL), 'text/markdown; profile="urn:air:agent-skills"; charset=utf-8');
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
