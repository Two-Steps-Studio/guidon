import { isSearchEvent, type SearchEvent } from "@/lib/search/search-metrics";

/** Best effort; never blocks search or navigation and never adds properties. */
export function countSearchEvent(event: SearchEvent) {
  try {
    if (!isSearchEvent(event) || navigator.doNotTrack === "1" || (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl) return;
    const body = new Blob([event], {type:"text/plain"});
    if (!navigator.sendBeacon?.("/api/search-metrics", body)) {
      void fetch("/api/search-metrics", {method:"POST", body, keepalive:true}).catch(() => {});
    }
  } catch { /* Analytics must never affect the product action. */ }
}
