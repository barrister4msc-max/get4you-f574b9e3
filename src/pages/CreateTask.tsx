import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { TaskAIAssistant } from '@/components/TaskAIAssistant';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera, Mic, ArrowRight, ArrowLeft, MapPin, DollarSign, CheckCircle2, Sparkles, Loader2,
} from 'lucide-react';

const categories = ['cleaning', 'moving', 'repair', 'digital', 'consulting', 'delivery', 'beauty', 'tutoring'];

const CreateTaskPage = () => {
  const { t, currency } = useLanguage();
  const [step, setStep] = useState(1);
  const [categorizing, setCategorizing] = useState(false);
  const [form, setForm] = useState({
    category: '',
    taskType: 'onsite' as 'onsite' | 'remote',
    title: '',
    description: '',
    budgetType: 'fixed' as 'fixed' | 'range',
    budget: 100,
    budgetMax: 200,
    urgency: 'flexible',
    location: '',
  });

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const aiContext = `Title: ${form.title}, Description: ${form.description}, Category: ${form.category}, Type: ${form.taskType}`;

  const handleAISuggestion = (text: string) => {
    update({ description: text });
    toast.success(t('task.ai.applied') || 'AI suggestion applied!');
  };

  const handleAutoCategorize = async () => {
    if (!form.description && !form.title) {
      toast.error(t('task.ai.needDescription') || 'Please add a title or description first');
      return;
    }
    setCategorizing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-task-assistant`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'categorize',
          messages: [{ role: 'user', content: `Task title: ${form.title}\nDescription: ${form.description}` }],
        }),
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      update({
        category: data.category || form.category,
        taskType: data.task_type || form.taskType,
        budget: data.budget_min || form.budget,
        budgetMax: data.budget_max || form.budgetMax,
        urgency: data.urgency || form.urgency,
        title: data.improved_title || form.title,
      });
      toast.success(t('task.ai.categorized') || 'AI suggestions applied!');
    } catch {
      toast.error(t('task.ai.error') || 'AI service unavailable');
    } finally {
      setCategorizing(false);
    }
  };

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-2xl">
        <h1 className="text-2xl font-bold mb-8">{t('task.create.title')}</h1>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s ? 'bg-gradient-emerald text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          {step === 1 && (
            <div className="space-y-6">
              {/* AI / Photo / Voice */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:shadow-card-hover transition-all bg-blue-50 text-blue-600"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-xs font-medium">{t('task.photos')}</span>
                </button>
                <button
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:shadow-card-hover transition-all bg-orange-50 text-orange-600"
                >
                  <Mic className="w-6 h-6" />
                  <span className="text-xs font-medium">{t('task.voice')}</span>
                </button>
                <TaskAIAssistant onApplySuggestion={handleAISuggestion} context={aiContext} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('task.category')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ category: c })}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                        form.category === c
                          ? 'border-primary bg-emerald-50 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {t(`cat.${c}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('task.type')}</label>
                <div className="flex gap-2">
                  {(['onsite', 'remote'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update({ taskType: type })}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        form.taskType === type
                          ? 'border-primary bg-emerald-50 text-primary'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {t(`task.type.${type}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('task.title')}</label>
                <input
                  value={form.title}
                  onChange={(e) => update({ title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t('task.title.placeholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('task.description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder={t('task.description.placeholder')}
                />
              </div>

              {/* AI Auto-categorize button */}
              <button
                type="button"
                onClick={handleAutoCategorize}
                disabled={categorizing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {categorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t('task.ai.autoCategorize') || 'AI: Auto-fill category & budget'}
              </button>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('task.location')}</label>
                <div className="relative">
                  <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={t('task.location.placeholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('task.budget')}</label>
                  <div className="relative">
                    <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={form.budget}
                      onChange={(e) => update({ budget: Number(e.target.value) })}
                      className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">≈ {formatPrice(form.budget, currency === 'USD' ? 'ILS' : 'USD')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('task.urgency')}</label>
                  <select
                    value={form.urgency}
                    onChange={(e) => update({ urgency: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="flexible">{t('task.urgency.flexible')}</option>
                    <option value="soon">{t('task.urgency.soon')}</option>
                    <option value="urgent">{t('task.urgency.urgent')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('task.photos')}</label>
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/30 transition-colors cursor-pointer">
                  <Camera className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">{t('task.photos')}</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-card rounded-2xl border border-border p-6 space-y-3">
                <h3 className="font-bold text-lg">{form.title || '—'}</h3>
                <p className="text-sm text-muted-foreground">{form.description || '—'}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="bg-emerald-50 text-primary px-3 py-1 rounded-full font-medium">
                    {form.category ? t(`cat.${form.category}`) : '—'}
                  </span>
                  <span className="bg-secondary text-foreground px-3 py-1 rounded-full">
                    {t(`task.type.${form.taskType}`)}
                  </span>
                  <span className="bg-secondary text-foreground px-3 py-1 rounded-full">
                    {formatPrice(form.budget, currency)}
                  </span>
                </div>
                {form.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {form.location}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('task.back')}
            </button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              {t('task.next')}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity">
              {t('task.submit')}
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateTaskPage;
