# MCP OAuth client authentication

The MCP URL is `https://useguidon.com/api/mcp`. Connect using OAuth; a personal
API key is a separate authentication method, not an OAuth client secret.

## “Only public clients (token_endpoint_auth_method none) are supported.”

This error comes from Guidon's client metadata validation before the consent
screen. It means that the client metadata declares a method other than `none`.
The app's ChatGPT application/version identifiers do not identify that method.

Guidon supports public clients and, with migration 078 and the matching code,
CIMD clients using `private_key_jwt`. Both still require PKCE S256. For a signed
client, Guidon reads the client's HTTPS metadata and public keys, verifies the
assertion's signature, client identity, audience and lifetime, and rejects
repeated assertion IDs through a shared database primary key. The token and
revocation endpoints authenticate signed clients before processing tokens.
Shared-secret methods such as `client_secret_post` are not supported by CIMD.

Apply `src/db/migrations/078_oauth_client_assertions.sql` to the deployment's
database before deploying the updated server. Use the existing migration
runner (`npm run migrate` with the deployment's DATABASE_URL supplied securely),
or apply the new transactional migration through the Supabase SQL editor.
Then deploy and start a fresh ChatGPT connection. The server metadata must list
`private_key_jwt` in `token_endpoint_auth_methods_supported`. No client secret
needs to be copied into ChatGPT for a signed metadata client.

The production Guidon and ChatGPT metadata endpoints were inaccessible from
the development environment (network proxy 403), and the actual ChatGPT
client metadata URL was not available. Consequently, the implementation is
verified with signed test clients, not a completed production ChatGPT login.
If connection still fails, inspect only the public `client_id` URL's metadata
and its `token_endpoint_auth_method`; do not share authorization codes, state,
assertions or access/refresh tokens. A different method requires its own
implementation and must not be silently downgraded to public authentication.
