import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, createUser } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json()
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    
    // Check if user already exists
    const existingUser = getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json({ 
        error: 'An account with this email already exists' 
      }, { status: 409 })
    }
    
    // Password optional for email-only signup
    let passwordHash: string | undefined
    if (password && typeof password === 'string') {
      if (password.length < 6) {
        return NextResponse.json({ 
          error: 'Password must be at least 6 characters' 
        }, { status: 400 })
      }
      passwordHash = await hashPassword(password)
    }
    
    // Create user
    const user = createUser(email, name, passwordHash)
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
