import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/db'
import { verifyPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }
    
    // Find user
    const user = getUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    
    // Check if user has password
    if (!user.password_hash) {
      return NextResponse.json({ 
        error: 'NO_PASSWORD',
        message: 'Set your password to sign in, or use Google/Facebook if you signed up that way.',
      }, { status: 401 })
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
