# Doodhwala 🥛

**A local-first milk marketplace for independent milk providers.**

Doodhwala is designed around one clear rule: this is not a catalogue for Amul, Jain Dairy, or other large dairy brands. The supply side is made of neighbourhood milk sellers who can serve customers in their own delivery area.

## Product vision

Think of the convenience and discovery model of a food-delivery marketplace, but focused entirely on milk:

- Customers discover independent providers near their location.
- Providers publish their milk types, pricing, timings, availability and delivery area.
- Customers can order one-off milk or recurring daily plans.
- Trust, verification, ratings, delivery reliability and locality are core product features.
- The customer interface is intentionally adapted for mobile, tablet/laptop and desktop rather than simply scaling one layout.

## First MVP in this repository

- Doodhwala customer home/explore experience
- Local provider discovery cards
- Cow / buffalo / A2 / subscription filters
- Search by provider, area and milk type
- Functional cart with quantity controls
- LocalStorage cart persistence
- Desktop sidebar navigation
- Mobile bottom navigation
- Responsive layout with device-specific interaction patterns
- PWA manifest + offline service worker
- Doodhwala logo and brand foundation

The current provider listings are **demo data** for UI/product development and are not claims about real businesses.

## Product architecture planned next

### Customer
Account → location/address → nearby provider feed → provider page → product selection → cart → checkout → live order status → subscriptions → ratings

### Local provider
Provider signup → identity/business verification → service area → milk catalogue → price/availability → delivery schedule → incoming orders → route/delivery status → earnings

### Doodhwala operations
Provider moderation → verification → service-area management → disputes/support → marketplace analytics → fraud/safety controls

## Recommended backend direction

Supabase is a strong next step for the MVP because it can cover:

- PostgreSQL database
- Customer/provider authentication
- Row Level Security
- Storage for provider photos/documents
- Realtime order status
- Edge Functions for server-side operations

The current frontend is intentionally static-first so the product experience can be tested before introducing backend complexity.

## Suggested data model

Users, provider_profiles, provider_service_areas, milk_products, product_prices, delivery_slots, orders, order_items, subscriptions, addresses, reviews, provider_documents, notifications.

## Important marketplace rule

The production system should enforce a provider policy at onboarding/admin level so large packaged dairy brands cannot simply sign up as ordinary local providers. Doodhwala is intended to serve genuine independent/local milk sellers.

## Development phases

1. Customer MVP and responsive UX ✅
2. Provider onboarding + provider dashboard
3. Supabase schema + Auth + RLS
4. Location-aware provider discovery
5. Product catalogue + availability
6. Cart → address → checkout
7. Orders + notifications
8. Recurring milk subscriptions
9. Payments
10. Verification, ratings, support and admin
11. Production hardening + analytics

## Local development

This first build is plain HTML/CSS/JavaScript and can be served by any static web server. It can also be deployed as a static site and installed as a PWA.

