/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Ваш код подтверждения TaskFlow</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
            <tr>
              <td style={logoIcon}><span style={logoIconText}>T</span></td>
              <td style={logoTextTd}><span style={logoTextGreen}>Task</span><span style={logoTextGold}>Flow</span></td>
            </tr>
          </table>
        </Section>
        <Heading style={h1}>Подтвердите вашу личность</Heading>
        <Text style={text}>Используйте код ниже для подтверждения:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Код действителен ограниченное время. Если вы не запрашивали его,
          просто проигнорируйте это письмо.
        </Text>
        <Text style={copyright}>© 2026 Hooppy production Ltd.</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '40px 25px' }
const logoSection = { textAlign: 'center' as const, margin: '0 0 30px' }
const logoIcon = { width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, hsl(152, 55%, 42%), hsl(45, 95%, 55%))', textAlign: 'center' as const, verticalAlign: 'middle' as const }
const logoIconText = { color: '#ffffff', fontWeight: 'bold' as const, fontSize: '16px', lineHeight: '32px' }
const logoTextTd = { paddingLeft: '8px', verticalAlign: 'middle' as const }
const logoTextGreen = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(152, 55%, 42%)' }
const logoTextGold = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(45, 95%, 45%)' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(220, 20%, 14%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(220, 10%, 46%)', lineHeight: '1.6', margin: '0 0 25px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '28px', fontWeight: 'bold' as const, color: 'hsl(152, 55%, 42%)', margin: '0 0 30px', textAlign: 'center' as const, letterSpacing: '4px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const copyright = { fontSize: '11px', color: '#cccccc', margin: '10px 0 0', textAlign: 'center' as const }
