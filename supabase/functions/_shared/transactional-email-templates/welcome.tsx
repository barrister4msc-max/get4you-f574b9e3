/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "4You"

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="ru" dir="ltr">
    <Head />
    <Preview>Добро пожаловать в {SITE_NAME}!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
            <tr>
              <td style={logoIcon}><span style={logoIconText}>T</span></td>
              <td style={logoTextTd}><span style={logoTextGreen}>4</span><span style={logoTextGold}>You</span></td>
            </tr>
          </table>
        </Section>
        <Heading style={h1}>
          {name ? `Добро пожаловать, ${name}!` : 'Добро пожаловать!'}
        </Heading>
        <Text style={text}>
          Спасибо за регистрацию на {SITE_NAME} — платформе, где заказчики 
          находят надёжных исполнителей, а специалисты получают клиентов за минуты.
        </Text>
        <Section style={stepsSection}>
          <Text style={stepText}>✅ Создайте задачу или найдите заказ</Text>
          <Text style={stepText}>✅ Получите предложения от проверенных специалистов</Text>
          <Text style={stepText}>✅ Безопасная оплата через эскроу</Text>
        </Section>
        <Button style={button} href="https://www.get4you.ai">
          Начать работу
        </Button>
        <Text style={footer}>
          С наилучшими пожеланиями,<br />Команда {SITE_NAME}
        </Text>
        <Text style={copyright}>© 2026 Hooppy production Ltd.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Добро пожаловать в 4You!',
  displayName: 'Welcome email',
  previewData: { name: 'Анна' },
} satisfies TemplateEntry

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
const stepsSection = { margin: '0 0 30px', padding: '20px', backgroundColor: 'hsl(152, 55%, 96%)', borderRadius: '12px' }
const stepText = { fontSize: '14px', color: 'hsl(220, 20%, 14%)', lineHeight: '1.8', margin: '0' }
const button = { backgroundColor: 'hsl(152, 55%, 42%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 24px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const copyright = { fontSize: '11px', color: '#cccccc', margin: '10px 0 0', textAlign: 'center' as const }
