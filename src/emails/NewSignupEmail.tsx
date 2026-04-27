import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components'
import { EmailLogo } from './components/EmailLogo'

interface Props {
  email?: string
  companyName?: string
  userId?: string
  signupAt?: string
  adminUrl?: string
}

export default function NewSignupEmail({
  email = 'cliente@exemplo.com',
  companyName = 'Fazenda Exemplo',
  userId = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  signupAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  adminUrl = 'https://www.irrigaagro.com.br/admin',
}: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Aprovação Pendente: {companyName ?? email} acabaram de se cadastrar.</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Admin Header */}
          <Section style={header}>
            <EmailLogo showAdmin />
          </Section>

          {/* Admin Notification Card */}
          <Section style={card}>
            {/* Faixa de Alerta Administrativo */}
            <div style={adminTopBar} />

            <Section style={content}>

              {/* Notification Badge */}
              <Section style={{ marginBottom: 24 }}>
                <Row>
                  <Column style={{ width: '48px' }}>
                    <div style={iconCircle}>🔔</div>
                  </Column>
                  <Column>
                    <Text style={heading}>Novo Cadastro</Text>
                    <Text style={subHeading}>Aguardando revisão e aprovação</Text>
                  </Column>
                </Row>
              </Section>

              {/* Ficha do Cliente */}
              <Section style={infoBox}>
                <Text style={infoTitle}>Informações do Solicitante</Text>

                <Section style={dataGrid}>
                  <Row style={dataItem}>
                    <Column style={labelCol}><Text style={label}>Empresa</Text></Column>
                    <Column><Text style={value}>{companyName || 'Não informada'}</Text></Column>
                  </Row>

                  <Row style={dataItem}>
                    <Column style={labelCol}><Text style={label}>E-mail</Text></Column>
                    <Column><Text style={value}>{email}</Text></Column>
                  </Row>

                  <Row style={dataItem}>
                    <Column style={labelCol}><Text style={label}>Data/Hora</Text></Column>
                    <Column><Text style={value}>{signupAt}</Text></Column>
                  </Row>

                  <Row>
                    <Column style={labelCol}><Text style={label}>ID Interno</Text></Column>
                    <Column><Text style={monoValue}>{userId}</Text></Column>
                  </Row>
                </Section>
              </Section>

              {/* Ação do Admin */}
              <Section style={actionSection}>
                <Button href={adminUrl} style={primaryButton}>
                  Aprovar no Painel Administrativo →
                </Button>
                <Text style={hintText}>
                  Lembre-se: o cliente não terá acesso às funcionalidades até que esta ação seja concluída.
                </Text>
              </Section>

            </Section>
          </Section>

          {/* Footer Admin */}
          <Section style={footer}>
            <Text style={footerText}>IrrigaAgro HQ • Notificação de Sistema</Text>
            <Hr style={footerDivider} />
            <Text style={footerLinkText}>
              <a href="https://www.irrigaagro.com.br" style={link}>Portal Corporativo</a>
              <span style={dot}>•</span>
              <a href="https://www.irrigaagro.com.br/admin" style={link}>Painel Admin</a>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: 580,
  margin: '0 auto',
  padding: '40px 12px',
}

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingBottom: 32,
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
}

const adminTopBar: React.CSSProperties = {
  height: 6,
  background: 'linear-gradient(90deg, #f59e0b 0%, #0093D0 100%)',
}

const content: React.CSSProperties = {
  padding: '40px',
}

const iconCircle: React.CSSProperties = {
  width: 40,
  height: 40,
  backgroundColor: '#fffbeb',
  borderRadius: '10px',
  border: '1px solid #fef3c7',
  textAlign: 'center',
  fontSize: 20,
  lineHeight: '38px',
}

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: '#0f172a',
  margin: 0,
  lineHeight: 1.2,
}

const subHeading: React.CSSProperties = {
  fontSize: 14,
  color: '#64748b',
  margin: '2px 0 0',
}

const infoBox: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  padding: '24px',
  margin: '32px 0',
}

const infoTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 16px',
}

const dataGrid: React.CSSProperties = {
  width: '100%',
}

const dataItem: React.CSSProperties = {
  marginBottom: 12,
}

const labelCol: React.CSSProperties = {
  width: 100,
  verticalAlign: 'top',
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  margin: 0,
  paddingTop: 2,
}

const value: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1e293b',
  margin: 0,
}

const monoValue: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#94a3b8',
  margin: 0,
}

const actionSection: React.CSSProperties = {
  textAlign: 'center' as const,
}

const primaryButton: React.CSSProperties = {
  backgroundColor: '#0f172a',
  borderRadius: 10,
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 600,
  padding: '16px 32px',
  textDecoration: 'none',
  display: 'inline-block',
}

const hintText: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  lineHeight: 1.6,
  margin: '16px 0 0',
}

const footer: React.CSSProperties = {
  paddingTop: 32,
  textAlign: 'center' as const,
}

const footerText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#94a3b8',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const footerDivider: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '0 0 12px',
}

const footerLinkText: React.CSSProperties = {
  fontSize: 12,
  color: '#cbd5e1',
}

const link: React.CSSProperties = {
  color: '#0093D0',
  textDecoration: 'none',
  fontWeight: 500,
}

const dot: React.CSSProperties = {
  margin: '0 8px',
  color: '#e2e8f0',
}
