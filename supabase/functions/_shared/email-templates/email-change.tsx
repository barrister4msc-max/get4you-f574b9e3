/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Подтвердите смену email для 4You</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
            <tr>
              <td style={logoIcon}><span style={logoIconText}>4</span></td>
              <td style={logoTextTd}><span style={logoTextGreen}>4</span><span style={logoTextGold}>You</span></td>
            </tr>
          </table>
        </Section>
        <Heading style={h1}>Подтвердите смену email</Heading>
        <Text style={text}>
          Вы запросили смену email-адреса для 4You с{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          на{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>
          Нажмите на кнопку ниже, чтобы подтвердить изменение:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Подтвердить смену Email
        </Button>
        <Text style={footer}>
          Если вы не запрашивали это изменение, срочно защитите свой аккаунт.
        </Text>
        <Text style={copyright}>© 2026 Hooppy production Ltd.</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const link = { color: 'hsl(152, 55%, 42%)', textDecoration: 'underline' }
const button = { backgroundColor: 'hsl(152, 55%, 42%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 24px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const copyright = { fontSize: '11px', color: '#cccccc', margin: '10px 0 0', textAlign: 'center' as const }
