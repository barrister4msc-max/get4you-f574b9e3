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

const SITE_NAME = "TaskFlow"

interface PaymentReceiptProps {
  clientName?: string
  taskTitle?: string
  amount?: string
  currency?: string
  orderId?: string
}

const PaymentReceiptEmail = ({ clientName, taskTitle, amount, currency, orderId }: PaymentReceiptProps) => (
  <Html lang="ru" dir="ltr">
    <Head />
    <Preview>Квитанция об оплате — {amount || '—'} {currency || 'USD'} за "{taskTitle || 'задачу'}"</Preview>
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
        <Heading style={h1}>
          {clientName ? `${clientName}, оплата прошла успешно!` : 'Оплата прошла успешно!'}
        </Heading>
        <Section style={detailsSection}>
          <Text style={detailLabel}>Задача</Text>
          <Text style={detailValue}>{taskTitle || '—'}</Text>
          <Text style={detailLabel}>Сумма</Text>
          <Text style={detailValue}>{amount || '—'} {currency || 'USD'}</Text>
          {orderId && (
            <>
              <Text style={detailLabel}>Номер заказа</Text>
              <Text style={detailValue}>{orderId}</Text>
            </>
          )}
        </Section>
        <Text style={text}>
          Ваш платёж успешно обработан. Исполнитель получил уведомление и может приступить к работе.
          Средства будут переведены исполнителю после успешного завершения задачи.
        </Text>
        <Button style={button} href="https://www.get4you.ai/tasks">
          Мои задачи
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
  component: PaymentReceiptEmail,
  subject: (data: Record<string, any>) => `Квитанция об оплате: ${data.amount || ''} ${data.currency || 'USD'} за "${data.taskTitle || 'задачу'}"`,
  displayName: 'Payment receipt (client)',
  previewData: { clientName: 'Мария', taskTitle: 'Уборка квартиры', amount: '200', currency: 'USD', orderId: 'ORD-12345' },
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
