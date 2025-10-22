# Customers Manager Monolith - Elysia, Bun and Fly.io 📦

Monolithic service to handle business logic for managing customers as an independent contractor. I developed this service a while back when I was working as an independent contractor.

The idea is simple: minimize operational friction for your customers.

## Key Features

- Secure online payments
- Custom support
- Automatic invoice generation
- Project/service status tracking
- Contract generation with templates
- Secure credential-sharing with E2E encryption vault

> [!NOTE]  
> This is no longer an active project. I invite you to read the [LICENSE](https://github.com/yarso-su/customers-manager-service?tab=MIT-1-ov-file) before using part or all of this project's content. The original repo is still private for security concerns.

> [!WARNING]  
> This repository was designed to be deployed on [fly.io](https://fly.io/), but you can easily remove a couple of files to directly use the Dockerfile to create an image.

## Technologies

### Bun as JS Runtime (TypeScript) 🔥

This project was developed using the Bun API, and the Dockerfile is already configured to use it without major changes.

#### Fly.io

Originally, the service was designed to be deployed on [fly.io](https://fly.io/) to leverage the [LiteFS](https://fly.io/docs/litefs/) functionality (SQLite service embedded in a container).

This achieves great latency performance alongside the web app built with [Astro](https://astro.build/) ([frontend repo](https://github.com/yarso-su/customers-manager)).

### Elysia

[Elysia](https://elysiajs.com/) is an ergonomic TypeScript framework with end-to-end type safety, type integrity, and exceptional developer experience. Supercharged by Bun.

It has a lot of built-in utilities to build complete and functional systems.

### Other

- **Factura.com:** Invoice management service for Mexico.
- **Stripe:** Payment gateway.
- **Zoho Mail:** Zoho Mail API for programmatic email notifications.
- **R2 Cloudflare:** For static file storage on *threads* (internal real-time chats).
- **Cookies + JWT:** Custom sessions and authentication module.
- **SQLite:** Persistent data.

## Known Limitations

This is a custom implementation designed to suit specific requirements, so yeah, there are a lot of areas for improvement.

This project already has inconsistent structural implementations that should be improved to have a scalable and easy-to-maintain project. Although in its current state, it works as expected.

> [!WARNING]  
> The invoice generation module was designed to suit specific requirements. I invite you to review the current logic process and adapt it to your own requirements.

> [!NOTE]  
> There are comments with an "IMPORTANT" tag that you should check to set some specific hardcoded values in the project.

## Environment Variables

- **PORT:** Number
- **CLIENT_URL:** Frontend URL for CORS
- **DB_URL:** SQLite URL
- **REFRESH_SECRET:** String
- **LOGGER_SECRET:** String
- **ACCESS_SECRET:** String
- **REGISTER_SECRET:** String
- **VERIFICATION_SECRET:** String
- **PASSWORD_RESET_SECRET:** String
- **EMAIL_UPDATE_SECRET:** String
- **CHAT_SECRET:** String
- **FACTURA_GENERIC_CLIENT_ID:** Factura.com generic client for your account
- **FACTURA_API_KEY:** Factura.com API key
- **FACTURA_SECRET_KEY:** Factura.com secret key
- **STRIPE_SECRET_KEY:** Stripe secret key
- **STRIPE_WEBHOOK_SECRET:** Stripe webhook secret
- **ADMIN_EMAIL_ADDRESS:** Static admin email
- **TERMS_V:** Fixed terms version (legal documents)
- **TERMS_HASH:** Terms hash for the fixed version (legal documents)
- **POLICIES_V:** Fixed policies version (legal documents)
- **POLICIES_HASH:** Policies hash for the fixed version (legal documents)
- **R2_ACCESS_KEY_ID:** Cloudflare R2 access key ID
- **R2_SECRET_ACCESS_KEY:** Cloudflare R2 secret access key
- **R2_ENDPOINT:** Cloudflare R2 endpoint
- **R2_BUCKET_NAME:** Cloudflare R2 bucket name
- **ZOHO_CLIENT_ID:** Zoho client ID
- **ZOHO_CLIENT_SECRET:** Zoho client secret
- **ZOHO_ACCOUNT_ID:** Zoho account ID
- **LEGAL_HASHES_REPOSITORY_URL:** Legal docs repository URL

## License

MIT License.
