# Doodhwala Supabase setup

## 1. Create the project

Create a new Supabase project for Doodhwala. Do not reuse the existing Learner's Guide project.

The Phase 3/4 schema is in:

supabase/migrations/20261007_doodhwala_marketplace.sql

Run that migration on the new Doodhwala project.

## 2. Configure the browser client

Open supabase-config.js and set:

window.DOODHWALA_SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
window.DOODHWALA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";

Only use the publishable key in the browser. Never put a secret/service-role key in this file.

The project should have RLS enabled exactly as defined by the migration.

## 3. Auth

The customer flow is available at /auth.html.

The current implementation supports:

- email/password sign up
- email/password sign in
- customer profile creation through the Auth trigger
- redirect back to checkout or provider onboarding

Supabase email confirmation may be required depending on the project's Auth settings.

## 4. Provider onboarding

/provider.html now attempts to sync to Supabase when a provider is authenticated.

Provider accounts are created with:

- provider profile
- service area
- delivery radius
- milk products
- pending verification state

A provider is not public marketplace inventory until its verification record is approved.

## 5. Customer discovery

The customer homepage calls find_nearby_providers(latitude, longitude, radius) when Supabase is configured.

The RPC returns:

- provider identity
- locality/city
- distance
- rating
- delivery window
- active milk products

The browser location is requested only when the customer asks to find nearby providers.

## 6. Checkout

/checkout.html handles:

1. authentication check
2. delivery address
3. cart review
4. provider grouping
5. atomic order creation

The checkout creates one order per provider when a cart contains products from multiple local sellers.

The create_order RPC validates the provider, address ownership and product availability, and reads the product price from the database rather than trusting the browser's displayed price.

Payments are intentionally not connected yet.

## 7. Provider verification

New providers are automatically created with provider_verifications.status = 'pending'.

Only approved providers and their active products are publicly discoverable.

The verification table is designed so provider self-registration cannot grant itself an approved status.

## 8. Security model

- RLS is enabled on exposed tables.
- Browser code uses only the publishable key.
- Ownership checks use auth.uid().
- Authorization does not depend on editable user metadata.
- The atomic order RPC is isolated in a private schema and checks auth.uid() before doing privileged order creation.
- Provider approval checks use a private helper rather than recursive RLS queries.

## Current limitation

The repository is ready for a Doodhwala Supabase project, but that project has not yet been provisioned in this environment. Until its URL/key are configured, the customer UI intentionally stays on its demo provider dataset.
