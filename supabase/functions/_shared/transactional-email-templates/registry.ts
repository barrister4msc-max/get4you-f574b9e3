/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcome } from './welcome.tsx'
import { template as adminMessage } from './admin-message.tsx'
import { template as paymentReceived } from './payment-received.tsx'
import { template as paymentReceipt } from './payment-receipt.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'admin-message': adminMessage,
  'payment-received': paymentReceived,
  'payment-receipt': paymentReceipt,
}
