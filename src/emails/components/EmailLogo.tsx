import { Row, Column, Text } from '@react-email/components'

interface Props {
  showAdmin?: boolean
}

export function EmailLogo({ showAdmin = false }: Props) {
  return (
    <Row>
      <Column align="center">
        <div
          style={{
            display: 'inline-block',
            background: '#0f1923',
            borderRadius: 14,
            padding: '14px 28px',
          }}
        >
          <span
            style={{
              fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
              fontSize: 26,
              fontWeight: 800,
              color: '#0093D0',
              letterSpacing: '-0.5px',
            }}
          >
            Irriga
          </span>
          <span
            style={{
              fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
              fontSize: 26,
              fontWeight: 300,
              color: '#22c55e',
              letterSpacing: '-0.5px',
            }}
          >
            Agro
          </span>
          {showAdmin && (
            <span
              style={{
                fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
                fontSize: 11,
                color: '#556677',
                marginLeft: 10,
                fontWeight: 500,
              }}
            >
              Admin
            </span>
          )}
        </div>
      </Column>
    </Row>
  )
}
