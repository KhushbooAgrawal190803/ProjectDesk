import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/layout/auth-shell'
import { ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot password" description="Password resets are handled by your administrator.">
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-stone-600">
          Contact a ProjectDesk administrator. They can send a password reset link to your email
          address from the Admin → User Management page.
        </p>
        <Link href="/login" className="block">
          <Button variant="outline" className="h-11 w-full">
            <ArrowLeft className="mr-2 size-4" />
            Back to Sign In
          </Button>
        </Link>
      </div>
    </AuthShell>
  )
}
