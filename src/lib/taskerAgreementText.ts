/**
 * Tasker Agreement — full text, versioned.
 * Bump AGREEMENT_VERSION whenever any locale text changes so a re-sign is required.
 */
export const AGREEMENT_VERSION = '1.0.0';

export type AgreementLocale = 'en' | 'ru' | 'he';

export const AGREEMENT_TEXT: Record<AgreementLocale, string> = {
  en: `TASKER AGREEMENT (v${'1.0.0'})

1. INTRODUCTION
This Agreement governs your use of the Flow4You platform as an independent tasker (service provider). By signing this Agreement you confirm that you have read, understood and agree to all its terms.

2. INDEPENDENT CONTRACTOR
You are an independent service provider, not an employee of Flow4You. You are solely responsible for your own taxes, insurance, licences, tools, equipment, and compliance with local law.

3. SERVICES
You agree to provide the services you list on the platform in a professional, timely and lawful manner. You confirm that you have the skills, permits and legal right to provide those services in your country of operation.

4. PAYMENTS AND FEES
All payments to taskers are processed through the platform's escrow. A service fee will be deducted from each completed transaction according to the fee schedule published on the platform. Withdrawals are subject to KYC checks and the withdrawal rules published in the app.

5. NOTIFICATIONS
You agree to receive operational and matching-task notifications inside the app, by e-mail and (if you opt in) via WhatsApp. You may adjust channels in your profile at any time except for critical operational messages.

6. ACCURATE INFORMATION
You confirm that all information you provide (name, phone, ID, city, tax status, categories, payout method) is true, complete and up to date. Providing false information may lead to suspension.

7. CONDUCT
You will not: contact clients outside the platform to avoid fees; share personal contact details in chat; solicit off-platform payment; discriminate; harass or defraud users; or use the platform for any unlawful purpose.

8. LIABILITY
You are responsible for the quality and safety of your work. Flow4You is a marketplace and is not a party to the service contract between you and the client.

9. TERMINATION
Either party may terminate this Agreement at any time. Flow4You may suspend or terminate your account for breach of this Agreement or the Terms of Service.

10. GOVERNING LAW
This Agreement is governed by the laws of the State of Israel. Any dispute will be resolved by the competent courts of Tel Aviv-Yafo.

11. ELECTRONIC SIGNATURE
You agree that your electronic acceptance of this Agreement (clicking the "Sign Agreement" button after ticking the required checkboxes) has the same legal force as a handwritten signature.

End of Agreement.`,

  ru: `СОГЛАШЕНИЕ ИСПОЛНИТЕЛЯ (v${'1.0.0'})

1. ВВЕДЕНИЕ
Настоящее Соглашение регулирует ваше использование платформы Flow4You в качестве независимого исполнителя. Подписывая это Соглашение, вы подтверждаете, что прочитали, поняли и согласны со всеми его условиями.

2. НЕЗАВИСИМЫЙ ПОДРЯДЧИК
Вы являетесь независимым исполнителем услуг, а не сотрудником Flow4You. Вы самостоятельно несёте ответственность за уплату налогов, страхование, лицензии, инструменты, оборудование и соблюдение местного законодательства.

3. УСЛУГИ
Вы обязуетесь предоставлять указанные вами услуги профессионально, своевременно и в рамках закона. Вы подтверждаете, что обладаете квалификацией, разрешениями и правом оказывать эти услуги в стране работы.

4. ПЛАТЕЖИ И КОМИССИИ
Все выплаты исполнителям проводятся через эскроу платформы. С каждой завершённой транзакции удерживается сервисная комиссия согласно тарифам, опубликованным на платформе. Вывод средств проходит проверку KYC и происходит по правилам, опубликованным в приложении.

5. УВЕДОМЛЕНИЯ
Вы соглашаетесь получать операционные и matching-уведомления о задачах внутри приложения, по e-mail и (при согласии) в WhatsApp. Вы можете изменить каналы в профиле в любое время, кроме критически важных операционных сообщений.

6. ТОЧНОСТЬ ДАННЫХ
Вы подтверждаете, что все указанные данные (ФИО, телефон, документ, город, налоговый статус, категории, способ выплаты) достоверны, полны и актуальны. Предоставление ложных сведений может привести к блокировке.

7. ПРАВИЛА ПОВЕДЕНИЯ
Вы обязуетесь: не связываться с клиентами вне платформы с целью уклонения от комиссии; не передавать личные контакты в чате; не предлагать оплату вне платформы; не допускать дискриминации, харрасмента или мошенничества; не использовать платформу в незаконных целях.

8. ОТВЕТСТВЕННОСТЬ
Вы несёте ответственность за качество и безопасность своих работ. Flow4You является маркетплейсом и не является стороной договора об услугах между вами и клиентом.

9. ПРЕКРАЩЕНИЕ
Любая сторона может расторгнуть это Соглашение в любое время. Flow4You вправе приостановить или закрыть ваш аккаунт за нарушение настоящего Соглашения или Условий сервиса.

10. ПРИМЕНИМОЕ ПРАВО
Настоящее Соглашение регулируется законодательством Государства Израиль. Все споры разрешаются компетентными судами Тель-Авива-Яффо.

11. ЭЛЕКТРОННАЯ ПОДПИСЬ
Вы соглашаетесь с тем, что ваше электронное принятие этого Соглашения (нажатие кнопки «Подписать» после установки обязательных отметок) имеет ту же юридическую силу, что и собственноручная подпись.

Конец Соглашения.`,

  he: `הסכם מבצע משימות (v${'1.0.0'})

1. מבוא
הסכם זה מסדיר את השימוש שלך בפלטפורמת Flow4You כמבצע עצמאי. בחתימה על הסכם זה אתה מאשר כי קראת, הבנת והסכמת לכל תנאיו.

2. עצמאי (קבלן עצמאי)
אתה מספק שירות עצמאי ואינך עובד של Flow4You. אתה אחראי באופן בלעדי למס, ביטוח, רישיונות, כלים, ציוד ולציות לחוק המקומי.

3. שירותים
אתה מתחייב לספק את השירותים שאתה מציג בפלטפורמה באופן מקצועי, בזמן ובהתאם לחוק. אתה מאשר כי יש לך את הכישורים, ההיתרים והזכות החוקית לספק את השירותים במדינת הפעילות שלך.

4. תשלומים ועמלות
כל התשלומים למבצעים מבוצעים דרך נאמנות של הפלטפורמה. עמלת שירות תנוכה מכל עסקה שהושלמה בהתאם לתעריפים המפורסמים בפלטפורמה. משיכות כפופות לבדיקות KYC ולכללי המשיכה המפורסמים באפליקציה.

5. התראות
אתה מסכים לקבל התראות תפעוליות והתראות על משימות מתאימות בתוך האפליקציה, בדוא"ל, ואם בחרת — גם ב-WhatsApp. ניתן לשנות ערוצים בפרופיל בכל עת, למעט הודעות תפעוליות קריטיות.

6. דיוק המידע
אתה מאשר כי כל המידע שסיפקת (שם, טלפון, ת"ז, עיר, סטטוס מס, קטגוריות ואמצעי תשלום) נכון, מלא ומעודכן. מסירת מידע כוזב עלולה להוביל להשעיה.

7. התנהגות
אתה מתחייב שלא: ליצור קשר עם לקוחות מחוץ לפלטפורמה כדי להימנע מעמלות; לא לחלוק פרטי קשר בצ'אט; לא להציע תשלום מחוץ לפלטפורמה; לא להפלות, להטריד או לרמות משתמשים; ולא להשתמש בפלטפורמה למטרות בלתי חוקיות.

8. אחריות
אתה אחראי לאיכות ולבטיחות עבודתך. Flow4You היא זירת מסחר בלבד ואינה צד להסכם השירות בינך לבין הלקוח.

9. סיום
כל צד רשאי לסיים הסכם זה בכל עת. Flow4You רשאית להשעות או לסגור את חשבונך בגין הפרת הסכם זה או תנאי השימוש.

10. דין חל
על הסכם זה יחולו דיני מדינת ישראל. סמכות שיפוט ייחודית לבתי המשפט המוסמכים בתל-אביב-יפו.

11. חתימה אלקטרונית
אתה מסכים כי קבלה אלקטרונית של הסכם זה (לחיצה על "חתום על ההסכם" לאחר סימון תיבות החובה) שוות תוקף לחתימה בכתב יד.

סוף ההסכם.`,
};

export function pickAgreementLocale(l: string): AgreementLocale {
  if (l === 'ru') return 'ru';
  if (l === 'he') return 'he';
  return 'en';
}

export function getAgreementText(locale: string): { text: string; locale: AgreementLocale } {
  const key = pickAgreementLocale(locale);
  return { text: AGREEMENT_TEXT[key] ?? AGREEMENT_TEXT.en, locale: key };
}

/** Simple deterministic hash (SHA-256, hex) using WebCrypto. */
export async function hashAgreementText(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}