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

interface AdminMessageProps {
  taskTitle?: string
  messagePreview?: string
  taskUrl?: string
}

const AdminMessageEmail = ({ taskTitle, messagePreview, taskUrl }: AdminMessageProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New message from {SITE_NAME} admin regarding "{taskTitle || 'your task'}"</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={h1}>{SITE_NAME}</Heading>
        </Section>
        <Section style={contentSection}>
          <Heading as="h2" style={h2}>
            New message from Admin
          </Heading>
          <Text style={text}>
            You have a new message regarding the task: <strong>{taskTitle || 'your task'}</strong>
          </Text>
          {messagePreview && (
            <Section style={quoteSection}>
              <Text style={quoteText}>{messagePreview}</Text>
            </Section>
          )}
          {taskUrl && (
            <Section style={{ textAlign: 'center' as const, margin: '30px 0' }}>
              <Button style={button} href={taskUrl}>
                View Chat
              </Button>
            </Section>
          )}
          <Text style={footer}>
            — The {SITE_NAME} Team
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminMessageEmail,
  subject: (data: Record<string, any>) =>
    `New message from Admin — ${data?.taskTitle || 'your task'}`,
  displayName: 'Admin chat message notification',
  previewData: {
    taskTitle: 'Fix kitchen faucet',
    messagePreview: 'Hello! I wanted to check in on this task...',
    taskUrl: 'https://get4you.lovable.app/tasks/123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '0', maxWidth: '560px', margin: '0 auto' }
const headerSection = {
  background: 'linear-gradient(135deg, hsl(152, 55%, 42%), hsl(152, 52%, 48%))',
  padding: '30px 25px',
  borderRadius: '12px 12px 0 0',
  textAlign: 'center' as const,
}
const h1 = { fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: '0' }
const contentSection = { padding: '30px 25px' }
const h2 = { fontSize: '20px', fontWeight: '600', color: 'hsl(220, 20%, 14%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(220, 10%, 46%)', lineHeight: '1.6', margin: '0 0 20px' }
const quoteSection = {
  backgroundColor: 'hsl(220, 14%, 95%)',
  borderLeft: '3px solid hsl(152, 55%, 42%)',
  borderRadius: '0 8px 8px 0',
  padding: '12px 16px',
  margin: '0 0 20px',
}
const quoteText = { fontSize: '14px', color: 'hsl(220, 20%, 14%)', margin: '0', lineHeight: '1.5' }
const button = {
  backgroundColor: 'hsl(152, 55%, 42%)',
  color: '#ffffff',
  padding: '12px 30px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(220, 10%, 46%)', margin: '30px 0 0' }
