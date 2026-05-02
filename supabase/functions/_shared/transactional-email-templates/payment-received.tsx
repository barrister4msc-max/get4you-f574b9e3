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

interface PaymentReceivedProps {
  taskerName?: string
  taskTitle?: string
  amount?: string
  currency?: string
}

const PaymentReceivedEmail = ({ taskerName, taskTitle, amount, currency }: PaymentReceivedProps) => (
  <Html lang="ru" dir="ltr">
    <Head />
    <Preview>Оплата получена за "{taskTitle || 'задачу'}" — можно приступать к работе!</Preview>
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
          {taskerName ? `${taskerName}, оплата получена!` : 'Оплата получена!'}
        </Heading>
        <Section style={detailsSection}>
          <Text style={detailLabel}>Задача</Text>
          <Text style={detailValue}>{taskTitle || '—'}</Text>
          <Text style={detailLabel}>Сумма</Text>
          <Text style={detailValue}>{amount || '—'} {currency || 'USD'}</Text>
        </Section>
        <Text style={text}>
          Клиент оплатил задачу. Вы можете приступить к выполнению. 
          Средства будут переведены вам после успешного завершения работы.
        </Text>
        <Button style={button} href="https://www.get4you.ai/tasks">
          Перейти к задачам
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
  component: PaymentReceivedEmail,
  subject: (data: Record<string, any>) => `Оплата получена за "${data.taskTitle || 'задачу'}"`,
  displayName: 'Payment received (tasker)',
  previewData: { taskerName: 'Алексей', taskTitle: 'Ремонт кухни', amount: '150', currency: 'USD' },
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
const detailsSection = { margin: '0 0 25px', padding: '20px', backgroundColor: 'hsl(152, 55%, 96%)', borderRadius: '12px' }
const detailLabel = { fontSize: '12px', color: 'hsl(220, 10%, 46%)', margin: '0 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const detailValue = { fontSize: '16px', fontWeight: '600' as const, color: 'hsl(220, 20%, 14%)', margin: '0 0 12px' }
const button = { backgroundColor: 'hsl(152, 55%, 42%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 24px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const copyright = { fontSize: '11px', color: '#cccccc', margin: '10px 0 0', textAlign: 'center' as const }
