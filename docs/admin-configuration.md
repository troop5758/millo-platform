# Admin Configuration System

The Millo platform supports configuring all service integrations from the admin dashboard. This allows administrators to manage API keys, service providers, and platform settings without direct server access.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard                          │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  Email  │ │   AI    │ │Payments │ │  OAuth  │   ...     │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
└───────┼──────────┼──────────┼──────────┼───────────────────┘
        │          │          │          │
        ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Admin Config API                           │
│         GET/PUT/DELETE /admin/config/*                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              System Configuration Service                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Encryption  │  │    Cache     │  │  Validation  │      │
│  │  (AES-256)   │  │  (30s TTL)   │  │    Schema    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Configuration Sources                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Database   │→ │  Env Vars    │→ │   Defaults   │      │
│  │  (Priority)  │  │  (Fallback)  │  │  (Fallback)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Priority

1. **Database** — Values stored via admin dashboard (highest priority)
2. **Environment Variables** — Traditional .env or system env vars
3. **Defaults** — Hardcoded defaults in the configuration schema

## Configurable Categories

### Email Service
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `email.provider` | select | `EMAIL_PROVIDER` | sendgrid, aws_ses, resend, smtp, console |
| `email.from` | email | `EMAIL_FROM` | Default from address |
| `email.sendgrid_api_key` | string | `SENDGRID_API_KEY` | SendGrid API key |
| `email.resend_api_key` | string | `RESEND_API_KEY` | Resend API key |
| `email.smtp_host` | string | `SMTP_HOST` | SMTP server host |
| `email.smtp_port` | number | `SMTP_PORT` | SMTP server port |
| `email.smtp_user` | string | `SMTP_USER` | SMTP username |
| `email.smtp_pass` | string | `SMTP_PASS` | SMTP password |

### AI Services
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `ai.openai_api_key` | string | `OPENAI_API_KEY` | OpenAI API key |
| `ai.openai_model` | select | `OPENAI_MODEL` | gpt-4, gpt-4-turbo, gpt-3.5-turbo |
| `ai.anthropic_api_key` | string | `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `ai.hive_api_key` | string | `HIVE_API_KEY` | Hive AI moderation key |
| `ai.moderation_enabled` | boolean | `AI_MODERATION_ENABLED` | Enable AI moderation |
| `ai.shadow_mode` | boolean | — | AI suggestions only, no auto-actions |

### Payment Providers
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `payments.stripe_secret_key` | string | `STRIPE_SECRET_KEY` | Stripe secret key |
| `payments.stripe_publishable_key` | string | `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `payments.stripe_webhook_secret` | string | `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `payments.paypal_client_id` | string | `PAYPAL_CLIENT_ID` | PayPal client ID |
| `payments.paypal_client_secret` | string | `PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `payments.paypal_mode` | select | `PAYPAL_MODE` | sandbox, live |
| `payments.wise_api_key` | string | `WISE_API_KEY` | Wise API key for payouts |

### OAuth Providers
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `oauth.google_client_id` | string | `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `oauth.google_client_secret` | string | `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `oauth.facebook_client_id` | string | `OAUTH_FACEBOOK_CLIENT_ID` | Facebook App ID |
| `oauth.facebook_client_secret` | string | `OAUTH_FACEBOOK_CLIENT_SECRET` | Facebook App secret |
| `oauth.apple_client_id` | string | `OAUTH_APPLE_CLIENT_ID` | Apple client ID |
| `oauth.github_client_id` | string | `OAUTH_GITHUB_CLIENT_ID` | GitHub client ID |

### Cloudflare
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `cloudflare.api_token` | string | `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `cloudflare.account_id` | string | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `cloudflare.zone_id` | string | `CLOUDFLARE_ZONE_ID` | Cloudflare zone ID |
| `cloudflare.r2_access_key` | string | `CLOUDFLARE_R2_ACCESS_KEY` | R2 access key |
| `cloudflare.r2_secret_key` | string | `CLOUDFLARE_R2_SECRET_KEY` | R2 secret key |
| `cloudflare.r2_bucket` | string | `CLOUDFLARE_R2_BUCKET` | R2 bucket name |
| `cloudflare.turnstile_site_key` | string | `TURNSTILE_SITE_KEY` | Turnstile CAPTCHA site key |
| `cloudflare.turnstile_secret_key` | string | `TURNSTILE_SECRET_KEY` | Turnstile secret key |

### Storage
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `storage.provider` | select | `STORAGE_PROVIDER` | local, s3, r2, gcs, b2 |
| `storage.s3_bucket` | string | `AWS_S3_BUCKET` | S3 bucket name |
| `storage.s3_region` | string | `AWS_REGION` | AWS region |
| `storage.s3_access_key` | string | `AWS_ACCESS_KEY_ID` | AWS access key |
| `storage.s3_secret_key` | string | `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `storage.cdn_url` | url | `CDN_URL` | CDN base URL |

### Live Streaming
| Setting | Type | Env Var | Description |
|---------|------|---------|-------------|
| `streaming.janus_url` | url | `JANUS_GATEWAY_URL` | Janus Gateway URL |
| `streaming.janus_admin_secret` | string | `JANUS_ADMIN_SECRET` | Janus admin secret |
| `streaming.rtmp_url` | url | `RTMP_URL` | RTMP ingest URL |
| `streaming.hls_url` | url | `HLS_URL` | HLS playback URL |

### Platform Settings
| Setting | Type | Description |
|---------|------|-------------|
| `platform.app_name` | string | Application name |
| `platform.app_url` | url | Main application URL |
| `platform.support_email` | email | Support contact email |
| `platform.maintenance_mode` | boolean | Enable maintenance mode |
| `platform.registration_enabled` | boolean | Allow new registrations |
| `platform.invite_only` | boolean | Require invite to register |

## API Endpoints

### Get Configuration Schema
```http
GET /admin/config/schema
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "schema": {
    "email": {
      "label": "Email Service",
      "description": "Configure email delivery provider",
      "settings": [...]
    }
  }
}
```

### Get All Categories
```http
GET /admin/config
Authorization: Bearer <admin_token>
```

### Get Category Configuration
```http
GET /admin/config/:category
Authorization: Bearer <admin_token>
```

Example:
```http
GET /admin/config/email
```

Response:
```json
{
  "id": "email",
  "label": "Email Service",
  "settings": [
    {
      "key": "email.provider",
      "label": "Provider",
      "type": "select",
      "options": ["sendgrid", "aws_ses", "resend", "smtp", "console"],
      "value": "sendgrid",
      "hasValue": true,
      "source": "database"
    }
  ]
}
```

### Get Single Setting
```http
GET /admin/config/key/:key
Authorization: Bearer <admin_token>
```

### Update Setting
```http
PUT /admin/config/key/:key
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "value": "new_value"
}
```

### Delete Setting (Revert to Default)
```http
DELETE /admin/config/key/:key
Authorization: Bearer <admin_token>
```

### Bulk Update
```http
POST /admin/config/bulk
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "updates": [
    { "key": "email.provider", "value": "sendgrid" },
    { "key": "email.sendgrid_api_key", "value": "SG.xxxx" }
  ]
}
```

### Test Configuration
```http
POST /admin/config/:category/test
Authorization: Bearer <admin_token>
```

Tests the configuration (e.g., sends test email, validates Stripe connection).

### Export Configuration
```http
GET /admin/config/export
Authorization: Bearer <admin_token>
```

Returns a JSON backup of all configuration.

### Import Configuration
```http
POST /admin/config/import
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "backup": {
    "settings": [...]
  }
}
```

### Configuration Health
```http
GET /admin/config/health
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "health": {
    "email": { "configured": true, "provider": "sendgrid" },
    "payments": { "configured": true, "providers": ["stripe", "paypal"] },
    "oauth": { "configured": true, "providers": ["google", "facebook"] },
    "storage": { "configured": true, "provider": "s3" },
    "ai": { "configured": true },
    "streaming": { "configured": false },
    "eventbus": { "configured": true },
    "fraud": { "configured": false }
  }
}
```

## Security

### Encryption
All sensitive values (API keys, secrets) are encrypted at rest using AES-256-GCM. The encryption key is derived from:

1. `CONFIG_ENCRYPTION_KEY` environment variable (recommended)
2. `JWT_SECRET` (fallback)

### Access Control
- All configuration endpoints require admin authentication
- All changes are logged to `AdminAuditLog` collection
- Sensitive values are never returned in plaintext

### Audit Logging
Every configuration change is logged:

```json
{
  "action": "config_update",
  "adminId": "admin_123",
  "targetType": "PlatformSetting",
  "targetId": "email.provider",
  "meta": {
    "key": "email.provider",
    "sensitive": false,
    "newValue": "sendgrid"
  }
}
```

## Using Configuration in Services

### Direct Access
```javascript
const systemConfig = require('./services/systemConfigService');

const provider = await systemConfig.get('email.provider', 'console');
```

### Config Bridge (Typed Helpers)
```javascript
const config = require('./services/configBridge');

// Email
const emailProvider = await config.email.getProvider();
const smtpConfig = await config.email.getSmtpConfig();

// AI
const openaiKey = await config.ai.getOpenAIKey();
const isShadowMode = await config.ai.isShadowMode();

// Payments
const stripeKey = await config.payments.getStripeSecretKey();

// OAuth
const enabledProviders = await config.oauth.getEnabledProviders();
```

## Frontend Integration

### React Component Example

```jsx
function EmailConfigPanel() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('/admin/config/email', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(setConfig);
  }, []);

  const updateSetting = async (key, value) => {
    await fetch(`/admin/config/key/${key}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });
  };

  return (
    <div>
      <h2>{config?.label}</h2>
      {config?.settings.map(setting => (
        <ConfigField
          key={setting.key}
          setting={setting}
          onUpdate={updateSetting}
        />
      ))}
    </div>
  );
}
```

## Best Practices

1. **Always use encryption key in production** — Set `CONFIG_ENCRYPTION_KEY` to a strong 32-character key

2. **Test after changes** — Use the test endpoints to verify configurations work

3. **Backup before import** — Export current config before importing new settings

4. **Use database for runtime config** — Use env vars only for initial bootstrap

5. **Monitor health endpoint** — Regularly check `/admin/config/health` for missing configurations
