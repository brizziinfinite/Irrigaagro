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
      <Preview>Seu acesso ao IrrigaAgro foi liberado! 🌱</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Logo Header */}
          <Section style={header}>
            <EmailLogo />
          </Section>

          {/* Main Card */}
          <Section style={card}>
            {/* Faixa Gradiente Superior */}
            <div style={topGradient} />

            <Section style={content}>
              {/* Badge de Sucesso */}
              <Section style={{ textAlign: 'center' as const, marginBottom: 30 }}>
                <div style={badgeContainer}>
                  <div style={badgeInner}>
                    <span style={checkIcon}>✓</span>
                  </div>
                </div>
              </Section>

              <Text style={heading}>Tudo pronto para o plantio!</Text>

              <Text style={paragraph}>
                Olá! É um prazer confirmar que o acesso da <strong style={highlight}>{companyName}</strong> ao
                <strong style={{ color: '#0093D0' }}> IrrigaAgro</strong> já está disponível.
              </Text>

              <Text style={paragraph}>
                Nossa tecnologia de balanço hídrico inteligente está pronta para ajudar você a otimizar o uso da água e maximizar sua produtividade.
              </Text>

              {/* CTA Principal */}
              <Section style={ctaArea}>
                <Button href="https://www.irrigaagro.com.br/login" style={button}>
                  Acessar Painel de Controle →
                </Button>
                <Text style={subText}>Clique acima para entrar no sistema</Text>
              </Section>

              <Hr style={divider} />

              {/* Guia de Início Rápido */}
              <Text style={label}>Como começar agora</Text>

              <Section style={featureGrid}>
                <Row style={featureRow}>
                  <Column style={featureNumCol}>
                    <div style={stepCircle}>1</div>
                  </Column>
                  <Column style={{ paddingLeft: 12 }}>
                    <Text style={featureTitle}>Cadastre seus Pivôs</Text>
                    <Text style={featureDesc}>Insira os dados técnicos para cálculos de precisão.</Text>
                  </Column>
                </Row>

                <Row style={featureRow}>
                  <Column style={featureNumCol}>
                    <div style={stepCircle}>2</div>
                  </Column>
                  <Column style={{ paddingLeft: 12 }}>
                    <Text style={featureTitle}>Inicie uma Safra</Text>
                    <Text style={featureDesc}>Defina cultura e data de plantio para monitoramento.</Text>
                  </Column>
                </Row>

                <Row style={featureRow}>
                  <Column style={featureNumCol}>
                    <div style={stepCircle}>3</div>
                  </Column>
                  <Column style={{ paddingLeft: 12 }}>
                    <Text style={featureTitle}>Economize Água e Energia</Text>
                    <Text style={featureDesc}>Irrigue na hora certa, na quantidade certa e reduza seus custos operacionais.</Text>
                  </Column>
                </Row>
              </Section>

            </Section>
          </Section>

          {/* Footer Social/Info */}
          <Section style={footer}>
            <Text style={footerBrand}>IrrigaAgro • Inteligência no Campo</Text>
            <Text style={footerLinks}>
              <a href="https://www.irrigaagro.com.br" style={footerLink}>Website</a>
              <span style={dotSeparator}>•</span>
              <a href="https://www.irrigaagro.com.br/suporte" style={footerLink}>Suporte</a>
              <span style={dotSeparator}>•</span>
              <a href="https://www.irrigaagro.com.br/login" style={footerLink}>Login</a>
            </Text>
            <Text style={legalText}>
              Este é um e-mail automático. © 2025 IrrigaAgro Technology.
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  fontFamily: 'Inter, -apple-system, sans-serif',
  margin: '0',
  padding: '0',
}

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '40px 20px',
}

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingBottom: '32px',
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  overflow: 'hidden',
  boxShadow: '0 10px 30px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.02)',
}

const topGradient: React.CSSProperties = {
  height: '8px',
  background: 'linear-gradient(90deg, #0093D0 0%, #22c55e 100%)',
}

const content: React.CSSProperties = {
  padding: '48px 40px',
}

const badgeContainer: React.CSSProperties = {
  display: 'inline-block',
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  backgroundColor: '#f0fdf4',
  border: '2px solid #dcfce7',
}

const badgeInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
}

const checkIcon: React.CSSProperties = {
  fontSize: '32px',
  lineHeight: '70px',
  color: '#16a34a',
  fontWeight: 'bold',
}

const heading: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: '800',
  color: '#0f172a',
  textAlign: 'center' as const,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
}

const paragraph: React.CSSProperties = {
  fontSize: '16px',
  color: '#475569',
  lineHeight: '1.6',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}

const highlight: React.CSSProperties = {
  color: '#1e293b',
  fontWeight: '600',
}

const ctaArea: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '12px 0 24px',
}

const button: React.CSSProperties = {
  backgroundColor: '#0093D0',
  borderRadius: '12px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '700',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 32px',
  boxShadow: '0 8px 20px rgba(0,147,208,0.3)',
}

const subText: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  marginTop: '12px',
}

const divider: React.CSSProperties = {
  borderColor: '#f1f5f9',
  margin: '40px 0',
}

const label: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: '700',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '20px',
}

const featureGrid: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderRadius: '16px',
  padding: '8px 20px',
}

const featureRow: React.CSSProperties = {
  margin: '16px 0',
}

const featureNumCol: React.CSSProperties = {
  width: '32px',
}

const stepCircle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  backgroundColor: '#0093D0',
  borderRadius: '50%',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  lineHeight: '24px',
}

const featureTitle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: '700',
  color: '#334155',
  margin: '0 0 2px',
}

const featureDesc: React.CSSProperties = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0',
}

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingTop: '32px',
}

const footerBrand: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#64748b',
  margin: '0 0 8px',
}

const footerLinks: React.CSSProperties = {
  fontSize: '13px',
  margin: '0 0 16px',
}

const footerLink: React.CSSProperties = {
  color: '#0093D0',
  textDecoration: 'none',
  fontWeight: '500',
}

const dotSeparator: React.CSSProperties = {
  color: '#cbd5e1',
  margin: '0 8px',
}

const legalText: React.CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
  margin: '0',
}
