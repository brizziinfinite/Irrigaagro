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
  companyName?: string
}

export default function ActivationEmail({ companyName = 'sua empresa' }: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Seu acesso ao IrrigaAgro foi liberado! Entre agora e comece a usar.</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Logo */}
          <Section style={{ paddingBottom: 28, textAlign: 'center' as const }}>
            <EmailLogo />
          </Section>

          {/* Card */}
          <Section style={card}>

            {/* Faixa gradiente no topo */}
            <div style={gradientBar} />

            <Section style={cardContent}>

              {/* Ícone check */}
              <div style={iconWrap}>
                <span style={{ fontSize: 28, lineHeight: '64px' }}>✓</span>
              </div>

              {/* Título */}
              <Text style={heading}>
                Acesso liberado!
              </Text>

              {/* Corpo */}
              <Text style={paragraph}>
                Olá! Sua conta IrrigaAgro para <strong style={{ color: '#0f172a' }}>{companyName}</strong> foi aprovada e está pronta para uso.
              </Text>

              <Text style={paragraph}>
                Você já pode acessar o sistema, cadastrar seus pivôs e safras, e começar a usar o balanço hídrico inteligente.
              </Text>

              {/* CTA */}
              <Section style={{ paddingTop: 8, paddingBottom: 8 }}>
                <Button href="https://www.irrigaagro.com.br/login" style={button}>
                  Acessar o IrrigaAgro →
                </Button>
              </Section>

              <Hr style={divider} />

              {/* Features */}
              <Text style={featuresLabel}>O que você pode fazer agora</Text>

              <Row style={{ marginBottom: 8 }}>
                <Column style={{ width: 32 }}>
                  <Text style={featureIcon}>💧</Text>
                </Column>
                <Column>
                  <Text style={featureText}>Gerenciar o balanço hídrico diário dos seus pivôs</Text>
                </Column>
              </Row>

              <Row style={{ marginBottom: 8 }}>
                <Column style={{ width: 32 }}>
                  <Text style={featureIcon}>🌱</Text>
                </Column>
                <Column>
                  <Text style={featureText}>Cadastrar safras e acompanhar cada fase da cultura</Text>
                </Column>
              </Row>

              <Row>
                <Column style={{ width: 32 }}>
                  <Text style={featureIcon}>📊</Text>
                </Column>
                <Column>
                  <Text style={featureText}>Receber recomendações de irrigação baseadas em FAO-56</Text>
                </Column>
              </Row>

            </Section>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>IrrigaAgro · Gestão inteligente de irrigação</Text>
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
  marginBottom: 0,
}

const gradientBar: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0093D0 0%, #22c55e 100%)',
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
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: '#f0fdf4',
  border: '2px solid #bbf7d0',
  marginBottom: 28,
  textAlign: 'center',
}

const heading: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 12px',
  lineHeight: '1.3',
}

const paragraph: React.CSSProperties = {
  fontSize: 15,
  color: '#475569',
  lineHeight: '1.7',
  margin: '0 0 16px',
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

const divider: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '32px 0',
}

const featuresLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 16px',
}

const featureIcon: React.CSSProperties = {
  fontSize: 18,
  margin: '0 0 8px',
  lineHeight: '1.4',
}

const featureText: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 8px',
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
