export function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false
  const emails = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  return emails.includes(email)
}
