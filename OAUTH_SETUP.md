# OAuth Login Setup Guide (Google & Facebook)

## Overview
To add Google and Facebook login, you'll need to implement OAuth 2.0 authentication. Here's what's required:

## 1. Install Dependencies

```bash
npm install next-auth@beta
# or for stable version:
npm install next-auth@^4
```

## 2. Set Up OAuth Providers

### Google OAuth Setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Set application type to "Web application"
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (dev)
7. Add production URI: `https://yourdomain.com/api/auth/callback/google`
8. Copy Client ID and Client Secret

### Facebook OAuth Setup:
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "Facebook Login" product
4. Go to Settings → Basic
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/facebook` (dev)
6. Add production URI: `https://yourdomain.com/api/auth/callback/facebook`
7. Copy App ID and App Secret

## 3. Environment Variables

Add to `.env.local`:
```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here # Generate with: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_CLIENT_ID=your-facebook-app-id
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
```

## 4. Create NextAuth API Route

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Add user ID to session
      if (session.user) {
        session.user.id = token.sub as string
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
})

export { handler as GET, handler as POST }
```

## 5. Update Auth System

### Update `src/lib/auth.ts`:
- Replace localStorage-based auth with NextAuth session
- Use `useSession()` hook from `next-auth/react`
- Update login/logout functions to use NextAuth

### Update `src/components/Navigation.tsx`:
- Use `useSession()` instead of `getCurrentUser()`
- Show user info from session

### Update `src/app/login/page.tsx`:
- Add "Sign in with Google" button
- Add "Sign in with Facebook" button
- Keep email-based login as fallback

## 6. Database Integration

You'll need to:
1. Store OAuth users in your database (users table)
2. Link OAuth accounts to existing users (if email matches)
3. Handle user creation on first OAuth login

Update `src/lib/db/index.ts`:
- Add function to find/create user from OAuth profile
- Store provider (google/facebook) and provider ID

## 7. API Route Updates

Update API routes to use session instead of `x-user-id` header:
- Get user from NextAuth session
- Use `session.user.id` instead of header

## 8. Migration Path

1. Keep existing localStorage auth as fallback
2. Add OAuth buttons alongside email login
3. Migrate existing users gradually
4. Eventually deprecate email-only login

## Estimated Implementation Time

- Setup: 2-3 hours
- Integration: 3-4 hours
- Testing: 1-2 hours
- **Total: 6-9 hours**

## Security Considerations

1. Always use HTTPS in production
2. Store secrets securely (never commit to git)
3. Validate OAuth callbacks
4. Handle token refresh
5. Implement proper session management
6. Add CSRF protection (NextAuth handles this)

## Alternative: Simpler OAuth Libraries

If you want a simpler approach without NextAuth:
- `@react-oauth/google` - Google only, client-side
- `react-facebook-login` - Facebook only, client-side

But NextAuth is recommended for production apps.
