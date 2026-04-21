import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileSignature, Loader2, CheckCircle2, ScrollText } from 'lucide-react';

const AGREEMENT_VERSION = '1.0';

const agreementTextRu = `СОГЛАШЕНИЕ НЕЗАВИСИМОГО ИСПОЛНИТЕЛЯ

Настоящее Соглашение Независимого Исполнителя («Соглашение») заключается между HandyMan4 You. AI LTD («Платформа»), зарегистрированной в Израиле, и Исполнителем, физическим лицом, проживающим в Израиле.

Платформа управляет онлайн-торговой площадкой, позволяющей Пользователям запрашивать выполнение различных задач, а Исполнителям – предлагать и выполнять такие задачи.

1. Статус Независимого Исполнителя

1.1. Исполнитель прямо и безоговорочно признает, что он является независимым подрядчиком (קבלן עצמאי) Платформы. Ничто в настоящем Соглашении не должно толковаться как создание отношений работника и работодателя, партнерства, совместного предприятия или агентства между Исполнителем и Платформой.

1.2. Исполнитель не является сотрудником Платформы и не имеет права на какие-либо льготы, условия или защиту, предоставляемые сотрудникам в соответствии с израильским трудовым законодательством, включая право на минимальную заработную плату, компенсацию за увольнение, отпускные, оплату больничных, пенсионные отчисления или любой другой социальный льготный план.

1.3. Исполнитель подтверждает, что он независим в своей деятельности и самостоятельно определяет средства и методы выполнения Задач.

2. Платежи и Расчеты

2.1. За выполнение Задач Исполнитель будет получать вознаграждение на основе количества и типа выполненных Задач, как это установлено Платформой. Платформа самостоятельно определяет и устанавливает тарифы за каждую Задачу, которые могут быть изменены по усмотрению Платформы после уведомления Исполнителя.

2.2. Платформа будет производить расчеты с Исполнителем после завершения и одобрения Задачи Пользователем и/или Платформой.

2.3. По усмотрению Платформы, могут предлагаться бонусы или поощрительные программы за выполнение Задач.

2.4. Платформа может взимать комиссию или сервисный сбор за использование платформы.

3. Налоговая Ответственность

3.1. Исполнитель несет полную и исключительную ответственность за уплату всех налогов, пошлин и других сборов, связанных с его доходом, включая подоходный налог (מס הכנסה), НДС (מע"מ) и отчисления в Институт национального страхования (ביטוח לאומי).

3.2. Исполнитель обязан зарегистрироваться в Налоговой Службе Израиля (רשות המסים) как независимый подрядчик (עצמאי) и соблюдать все налоговые законы Израиля.

3.3. Платформа не будет удерживать налоги или социальные отчисления из платежей Исполнителю, если иное не требуется законодательством.

4. Гибкость и График Работы

4.1. Исполнитель обладает полной свободой и гибкостью в определении своего рабочего графика. Исполнитель не обязан выполнять минимальное количество Задач или работать в определенные часы.

4.2. Исполнитель может принимать или отклонять Задачи по своему усмотрению.

4.3. Исполнитель может свободно работать для других лиц или организаций.

5. Отсутствие Трудовых Льгот

5.1. Поскольку Исполнитель является независимым подрядчиком, он не имеет права на получение трудовых льгот от Платформы:
  a. Оплачиваемый или неоплачиваемый отпуск.
  b. Оплачиваемый больничный.
  c. Компенсация за увольнение (פיצויי פיטורין).
  d. Отчисления в пенсионные фонды (פנסיה), фонды повышения квалификации (קרן השתלמות).
  e. Медицинское страхование или другие страховые полисы.

5.2. Исполнитель самостоятельно заботится о своем страховании.

6. Контроль Платформой и Управление Качеством

6.1. Платформа поддерживает систему оценки и обратной связи.

6.2. Исполнитель соглашается соблюдать все SLA и стандарты качества.

6.3. Платформа оставляет за собой право приостановить или деактивировать учетную запись Исполнителя в случае нарушения Соглашения, низких рейтингов или жалоб пользователей.

7. Ограничение Ответственности

7.1. Платформа не несет ответственности за ущерб, причиненный Исполнителю в связи с его деятельностью на Платформе.

7.2. Исполнитель обязуется возместить Платформе любые убытки, возникшие в результате его действий.

8. Конфиденциальность

8.1. Исполнитель обязуется не разглашать конфиденциальную информацию Платформы и пользователей.

9. Разрешение Споров

9.1. Настоящее Соглашение регулируется законодательством Государства Израиль. Все споры подлежат юрисдикции компетентных судов Израиля.

10. Электронная Подпись

10.1. Стороны признают юридическую силу электронной подписи в соответствии с Законом Израиля об электронной подписи (חוק חתימה אלקטרונית, 5761-2001).

10.2. Электронные записи, связанные с настоящим Соглашением, являются допустимыми доказательствами в судебных процедурах.

11. Общие Положения

11.1. Настоящее Соглашение представляет собой полное и единственное соглашение между Сторонами.

11.2. Если какое-либо положение будет признано недействительным, это не повлияет на остальные положения.`;

const agreementTextHe = `הסכם קבלן עצמאי

הסכם קבלן עצמאי זה ("ההסכם") נחתם בין HandyMan4 You. AI LTD ("הפלטפורמה"), חברה המאוגדת בישראל, לבין הקבלן, יחיד, תושב ישראל.

הפלטפורמה מפעילה זירת מסחר מקוונת המאפשרת למשתמשים לבקש ביצוע משימות שונות, ולקבלנים להציע ולבצע משימות אלו.

1. מעמד קבלן עצמאי

1.1. הקבלן מצהיר ומאשר במפורש ובאופן בלתי מסויג כי הוא קבלן עצמאי של הפלטפורמה. שום דבר בהסכם זה לא יפורש כיוצר יחסי עובד-מעביד, שותפות, מיזם משותף או יחסי שליחות.

1.2. הקבלן אינו עובד של הפלטפורמה ולא יהיה זכאי לכל הטבה, תנאי או הגנה הניתנים לעובדים לפי דיני העבודה הישראליים, לרבות זכות לשכר מינימום, פיצויי פיטורין, דמי חופשה, דמי מחלה, הפרשות פנסיוניות, או כל תוכנית הטבה סוציאלית.

1.3. הקבלן מאשר כי הינו עצמאי בביצוע עבודתו ורשאי לקבוע באופן עצמאי את האמצעים והשיטות לביצוע המשימות.

2. תשלומים ותעריפים

2.1. בגין ביצוע המשימות, יקבל הקבלן תמורה על בסיס מספר וסוג המשימות שהושלמו, כפי שייקבע על ידי הפלטפורמה. הפלטפורמה תקבע באופן בלעדי את התעריפים לכל משימה, ותוכל לשנותם לפי שיקול דעתה הבלעדי.

2.2. הפלטפורמה תבצע תשלומים לקבלן לאחר השלמת המשימה ואישורה.

2.3. ייתכנו הצעות לבונוסים או תוכניות תמריצים בגין ביצוע משימות.

2.4. הפלטפורמה עשויה לגבות עמלה או דמי שירות.

3. אחריות מסית

3.1. הקבלן נושא באחריות מלאה ובלעדית לתשלום כל המסים, האגרות וההיטלים, לרבות מס הכנסה, מע"מ ותשלומים למוסד לביטוח לאומי.

3.2. על הקבלן חלה החובה להירשם ברשות המסים כעצמאי ולציית לכל דיני המס בישראל.

3.3. הפלטפורמה לא תנכה מסים מהתשלומים, אלא אם נדרש על פי דין.

4. גמישות ולוח זמנים

4.1. הקבלן נהנה מחופש וגמישות מלאים בקביעת לוח הזמנים שלו. אין חובה לבצע מספר מינימלי של משימות.

4.2. הקבלן יכול לקבל או לדחות משימות לפי שיקול דעתו הבלעדי.

4.3. הקבלן חופשי לעבוד עבור גורמים אחרים.

5. היעדר הטבות סוציאליות

5.1. מאחר שהקבלן הינו קבלן עצמאי, אין לו זכאות להטבות עובד:
  א. חופשה בתשלום או ללא תשלום.
  ב. ימי מחלה בתשלום.
  ג. פיצויי פיטורין.
  ד. הפרשות לפנסיה, קרן השתלמות.
  ה. ביטוח בריאות או פוליסות ביטוח אחרות.

5.2. הקבלן ידאג באופן עצמאי לביטוחיו האישיים.

6. בקרת הפלטפורמה וניהול איכות

6.1. הפלטפורמה מפעילה מערכת דירוגים, ביקורות ומשוב.

6.2. הקבלן מסכים לציית לכל הסכמי רמת שירות (SLA) ותקני איכות.

6.3. הפלטפורמה שומרת לעצמה את הזכות להשעות או לבטל את חשבון הקבלן.

7. הגבלת אחריות

7.1. הפלטפורמה לא תישא באחריות לנזקים שנגרמו לקבלן בקשר לפעילותו.

7.2. הקבלן מסכים לשפות את הפלטפורמה.

8. סודיות

8.1. הקבלן מתחייב שלא לחשוף מידע סודי של הפלטפורמה והמשתמשים.

9. יישוב סכסוכים

9.1. הסכם זה כפוף לחוקי מדינת ישראל. כל סכסוך יידון בבתי המשפט המוסמכים בישראל.

10. חתימה אלקטרונית

10.1. הצדדים מכירים בתוקפה המשפטי של חתימה אלקטרונית בהתאם לחוק חתימה אלקטרונית, התשס"א-2001.

10.2. רשומות אלקטרוניות הקשורות להסכם זה מהוות ראיות קבילות בהליכים משפטיים.

11. הוראות כלליות

11.1. הסכם זה מהווה את ההסכם המלא והבלעדי בין הצדדים.

11.2. אם תנאי כלשהו ייקבע כבלתי תקף, לא יהיה בכך כדי לפגוע ביתר ההוראות.`;

const ContractorAgreementPage = () => {
  const { t, locale } = useLanguage();
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [confirmedRead, setConfirmedRead] = useState(false);

  const isRtl = locale === 'he' || locale === 'ar';
  const agreementText = locale === 'he' ? agreementTextHe : agreementTextRu;

  useEffect(() => {
    if (profile?.display_name) setFullName(profile.display_name);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const checkSigned = async () => {
      const { data } = await supabase
        .from('contractor_agreements' as any)
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      setAlreadySigned(!!data && data.length > 0);
    };
    checkSigned();
  }, [user]);

  const handleSign = async () => {
    if (!user) return;
    if (!fullName.trim() || !idNumber.trim()) {
      toast.error(t('contract.error.fields'));
      return;
    }
    if (!agreed || !confirmedRead) {
      toast.error(t('contract.error.agree'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('contractor_agreements' as any).insert({
        user_id: user.id,
        full_name: fullName.trim(),
        id_number: idNumber.trim(),
        agreement_version: AGREEMENT_VERSION,
        user_agent: navigator.userAgent,
      } as any);

      if (error) throw error;

      toast.success(t('contract.success'));
      setAlreadySigned(true);
    } catch (err: any) {
      toast.error(err.message || t('contract.error.submit'));
    } finally {
      setLoading(false);
    }
  };

  if (alreadySigned === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (alreadySigned) {
    return (
      <div className="py-12">
        <div className="container max-w-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t('contract.signed.title')}</h1>
          <p className="text-muted-foreground">{t('contract.signed.description')}</p>
          <Button onClick={() => navigate('/for-taskers')} variant="outline">
            {t('contract.signed.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 md:py-12">
      <div className="container max-w-3xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ScrollText className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('contract.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('contract.subtitle')}</p>
        </div>

        {/* Agreement text */}
        <div
          className="mt-6 p-6 rounded-2xl border bg-card max-h-[60vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-line"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {agreementText}
        </div>

        {/* Sign form */}
        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label>{t('contract.field.fullName')} *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('contract.field.fullNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('contract.field.idNumber')} *</Label>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={t('contract.field.idNumberPlaceholder')}
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="read"
              checked={confirmedRead}
              onCheckedChange={(v) => setConfirmedRead(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="read" className="text-sm cursor-pointer">
              {t('contract.checkbox.read')}
            </label>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="agree" className="text-sm cursor-pointer">
              {t('contract.checkbox.agree')}
            </label>
          </div>

          <Button
            onClick={handleSign}
            disabled={loading || !agreed || !confirmedRead}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <FileSignature className="w-4 h-4 mr-2" />
            )}
            {t('contract.sign')}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            {t('contract.legal.note')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContractorAgreementPage;
