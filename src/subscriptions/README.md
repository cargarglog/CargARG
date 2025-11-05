Módulo de Suscripciones (Web, Android, iOS)

Arquitectura
- Proveedor unificado en `src/subscriptions/provider.ts` con detección de plataforma.
- Web (Paddle.js): `src/subscriptions/providers/webPaddle.ts`.
- Android (Google Play Billing): `src/subscriptions/providers/android.ts` (puente vía WebView/Capacitor).
- iOS (StoreKit 2): `src/subscriptions/providers/ios.ts` (puente vía WKWebView).
- UI: `SubscriptionPlans.tsx` y `MySubscription.tsx`.
- Firestore helpers: `src/subscriptions/firestore.ts`.
- Cloud Functions: `functions/src/subscriptions.ts`.

Variables de entorno (Vite)
- VITE_PADDLE_VENDOR_ID
- VITE_PADDLE_PRODUCT_SILVER
- VITE_PADDLE_PRODUCT_GOLD
- VITE_ANDROID_PACKAGE_NAME
- VITE_GOOGLEPLAY_PRODUCT_SILVER
- VITE_GOOGLEPLAY_PRODUCT_GOLD
- VITE_APPLE_PRODUCT_SILVER
- VITE_APPLE_PRODUCT_GOLD

Variables de entorno (Functions)
- PADDLE_VENDOR_ID
- PADDLE_AUTH_CODE
- (opcional) PADDLE_PUBLIC_KEY para verificación de webhooks Classic.

Webhooks/Endpoints
- Paddle: desplegar `subscriptionsWebhookPaddle` y configurarlo en el dashboard de Paddle (Classic). Enviar `passthrough` con `{ uid, plan }`.
- Apple ASN y Google Play: placeholders listos para completar la verificación de tokens/firmas.

Uso en la app
```tsx
import { SubscriptionPlans, MySubscription } from '@/subscriptions';

// Página de planes
<SubscriptionPlans />

// Página "Mi Suscripción"
<MySubscription />
```

Seguridad
- El campo `users/{uid}.subscription` solo puede modificarse desde Functions (reglas actualizadas).
- En Web (Paddle), la compra se confirma vía webhook; el callable sólo deja un estado optimista.

