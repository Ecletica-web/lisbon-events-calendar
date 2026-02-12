import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, updateUserPassword } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({
        error: 'Password must be at least 6 characters',
      }, { status: 400 })
    }

    const user = getUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const passwordHash = await hashPassword(password)
    const updated = updateUserPassword(user.id, passwordHash)

    if (!updated) {
      return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch (error) {
    console.error('Set password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
