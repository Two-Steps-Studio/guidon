import { NextResponse } from "next/server";

/**
 * Any /api path no route handles: a JSON 404 instead of the HTML not-found
 * page, so API clients and agents can parse it. More specific routes always
 * win over this catch-all.
 */
function notFound() {
  return NextResponse.json(
    { error: "Not found. See /openapi.json for the API's endpoints and /developers for the guide." },
    { status: 404 }
  );
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
