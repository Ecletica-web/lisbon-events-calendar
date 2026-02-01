import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import CredentialsProvider from 'next-auth/providers/credentials'
import { getUserByEmail, createUser } from '@/lib/db'
import { verifyPassword } from '@/lib/password'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = getUserByEmail(credentials.email)
        if (!user || !user.password_hash) {
          return null
        }

        const isValid = await verifyPassword(credentials.password, user.password_hash)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false
      
      // Find or create user in database
      let dbUser = getUserByEmail(user.email)
      if (!dbUser) {
        dbUser = createUser(user.email, user.name || undefined)
      }
      
      return true
    },
    async session({ session, token }) {
      // Add user ID to session
      if (session.user?.email) {
        const dbUser = getUserByEmail(session.user.email)
        if (dbUser) {
          (session.user as any).id = dbUser.id
          session.user.name = dbUser.name || session.user.name
        }
      }
      return session
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = (user as any).id
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
