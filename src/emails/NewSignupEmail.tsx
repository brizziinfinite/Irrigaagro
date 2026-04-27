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
      <Preview>Novo cadastro aguardando aprovação: {companyName ?? email}</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Logo */}
          <Section style={{ paddingBottom: 28, textAlign: 'center' as const }}>
            <EmailLogo showAdmin />
          </Section>

          {/* Card */}
          <Section style={card}>

            {/* Faixa gradiente âmbar → azul */}
            <div style={gradientBar} />

            <Section style={cardContent}>

              {/* Ícone */}
              <div style={iconWrap}>
                <span style={{ fontSize: 24, lineHeight: '56px' }}>🔔</span>
              </div>

              {/* Título + data */}
              <Text style={heading}>
                Novo cliente aguardando aprovação
              </Text>
              <Text style={dateText}>{signupAt}</Text>

              {/* Tabela de dados */}
              <Section style={dataCard}>
                {companyName && (
                  <Row style={dataRow}>
                    <Column style={dataLabel}>
                      <Text style={labelText}>Empresa</Text>
                    </Column>
                    <Column>
                      <Text style={valueText}>{companyName}</Text>
                    </Column>
                  </Row>
                )}

                <Row style={dataRow}>
                  <Column style={dataLabel}>
                    <Text style={labelText}>E-mail</Text>
                  </Column>
                  <Column>
                    <Text style={valueText}>{email}</Text>
                  </Column>
                </Row>

                {userId && (
                  <Row>
                    <Column style={dataLabel}>
                      <Text style={labelText}>User ID</Text>
                    </Column>
                    <Column>
                      <Text style={userIdText}>{userId}</Text>
                    </Column>
                  </Row>
                )}
              </Section>

              {/* CTA */}
              <Section style={{ paddingTop: 4 }}>
                <Button href={adminUrl} style={button}>
                  Aprovar acesso →
                </Button>
              </Section>

              <Text style={hint}>
                O cliente vê uma tela de espera até você aprovar o acesso no painel.
              </Text>

            </Section>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>IrrigaAgro · Painel Administrativo</Text>
            <Text style={footerLink}>
              <a href="https://www.irrigaagro.com.br" style={{ color: '#0093D0', textDecoration: 'none' }}>
                www.irrigaagro.com.br
              </a>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#f0f4f8',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  padding: '40px 16px',
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
}

const gradientBar: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f59e0b 0%, #0093D0 100%)',
  height: 6,
  width: '100%',
}

const cardContent: React.CSSProperties = {
  padding: '40px 40px 36px',
}

const iconWrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: '50%',
  background: '#fffbeb',
  border: '2px solid #fde68a',
  marginBottom: 24,
  textAlign: 'center',
}

const heading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 4px',
  lineHeight: '1.3',
}

const dateText: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  margin: '0 0 24px',
}

const dataCard: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '20px 24px',
  marginBottom: 28,
}

const dataRow: React.CSSProperties = {
  marginBottom: 4,
}

const dataLabel: React.CSSProperties = {
  width: 110,
  verticalAlign: 'top',
}

const labelText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '6px 0',
}

const valueText: React.CSSProperties = {
  fontSize: 14,
  color: '#0f172a',
  margin: '6px 0',
  fontWeight: 500,
}

const userIdText: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontFamily: 'monospace',
  margin: '6px 0',
}

const button: React.CSSProperties = {
  backgroundColor: '#0093D0',
  borderRadius: 10,
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 600,
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block',
  boxShadow: '0 4px 14px rgba(0,147,208,0.35)',
}

const hint: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  margin: '20px 0 0',
  lineHeight: '1.6',
}

const footer: React.CSSProperties = {
  paddingTop: 24,
  textAlign: 'center',
}

const footerText: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  margin: '0 0 4px',
}

const footerLink: React.CSSProperties = {
  fontSize: 12,
  color: '#cbd5e1',
  margin: 0,
}
