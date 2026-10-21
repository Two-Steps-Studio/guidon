import { agentSkillsIndex, skillMarkdown } from "@/lib/agent-discovery";
import { discoveryPreflight, discoveryResponse, sha256Hex } from "@/lib/discovery-response";
import { SITE_URL } from "@/lib/site-url";

/** Agent Skills discovery index; the digest is of the exact SKILL.md bytes served next to it. */
export function GET(request: Request) {
  const index = agentSkillsIndex(SITE_URL, { skillDigest: sha256Hex(skillMarkdown(SITE_URL)) });
  return discoveryResponse(request, JSON.stringify(index, null, 2), "application/json");
}

export { GET as HEAD };
export const OPTIONS = discoveryPreflight;
