import { NextResponse } from "next/server";

/**
 * Any /.well-known document Guidon doesn't publish: a JSON 404 instead of
 * the HTML not-found page - agents probe dozens of these and parse the
 * answer. The documents that exist are their own, more specific routes.
 */
function notFound() {
  return NextResponse.json(
    {
      error: "Not found. Guidon publishes no such discovery document.",
      code: "not_found",
      see: ["/.well-known/api-catalog", "/llms.txt", "/openapi.json"],
    },
    { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export { notFound as GET, notFound as HEAD, notFound as POST };
