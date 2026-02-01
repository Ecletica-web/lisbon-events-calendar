# OAuth Quick Start Guide

## ✅ Implementation Complete!

Google and Facebook OAuth login has been fully implemented. Here's what you need to do:

## 1. Generate NextAuth Secret

Run this command to generate a secure secret:
```bash
openssl rand -base64 32
```

Or use an online generator: https://generate-secret.vercel.app/32

## 2. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "Google+ API"
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
7. Copy **Client ID** and **Client Secret**

## 3. Set Up Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add **Facebook Login** product
4. Go to **Settings** → **Basic**
5. Add **Valid OAuth Redirect URIs**:
   - Development: `http://localhost:3000/api/auth/callback/facebook`
   - Production: `https://yourdomain.com/api/auth/callback/facebook`
6. Copy **App ID** and **App Secret**

## 4. Update `.env.local`

Add these variables to your `.env.local` file:

```env
# NextAuth (Required)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-generated-secret-here

# Google OAuth (Optional - leave empty if not using)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth (Optional - leave empty if not using)
FACEBOOK_CLIENT_ID=your-facebook-app-id
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
```

## 5. Restart Dev Server

```bash
npm run dev
```

## How It Works

- **Login Page**: Shows Google, Facebook, and Email login options
- **OAuth Flow**: Users click button → Redirect to provider → Return to app → Auto-create account
- **Session Management**: Uses NextAuth.js sessions (secure, server-side)
- **Database**: Automatically creates users in your database on first OAuth login
- **Fallback**: Email login still works if OAuth is not configured

## Features

✅ Google OAuth login  
✅ Facebook OAuth login  
✅ Email login (fallback)  
✅ Automatic user creation  
✅ Session-based authentication  
✅ Secure token management  
✅ Works with existing profile system  

## Testing

1. Go to `/login`
2. Click "Continue with Google" or "Continue with Facebook"
3. Complete OAuth flow
4. You'll be redirected to `/profile`
5. Your account is automatically created!

## Troubleshooting

- **"Invalid redirect URI"**: Make sure the redirect URI in Google/Facebook matches exactly
- **"Missing credentials"**: Check that environment variables are set correctly
- **"Session not working"**: Make sure `NEXTAUTH_SECRET` is set and unique
