/**
 * Verifica se um email é super-admin.
 * Usa SUPER_ADMIN_EMAILS (sem NEXT_PUBLIC_) para não expor os emails no bundle do browser.
 * Deve ser chamada APENAS em Server Components, API routes ou Edge Functions.
 */
export function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false
  const raw = process.env.SUPER_ADMIN_EMAILS ?? ''
  const emails = raw.split(',').map(e => e.trim()).filter(Boolean)
  return emails.includes(email)
}
