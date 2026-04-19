import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { streamChat } from '@/lib/streamChat';
import { Bot, Send, X, Sparkles, Mic, MicOff, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Msg = { role: 'user' | 'assistant'; content: string; imageUrl?: string };

interface Props {
  onApplySuggestion?: (text: string) => void;
  context?: string;
}

export const TaskAIAssistant = ({ onApplySuggestion, context }: Props) => {
  const { t, locale } = useLanguage();
  const voice = useVoiceInput(locale);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const send = async () => {
    if ((!input.trim() && !attachedImage) || loading) return;
    const userMsg: Msg = { role: 'user', content: input, imageUrl: attachedImage || undefined };
    const contextMsg = context ? `[Current task context: ${context}]\n\n${input}` : input;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);
    setLoading(true);

    let assistantSoFar = '';
    const updateAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    await streamChat({
      functionName: 'ai-task-assistant',
      messages: [{ role: 'user', content: attachedImage ? `[User attached a photo]\n${contextMsg}` : contextMsg }],
      extraBody: { type: 'assist', userLocale: locale },
      onDelta: updateAssistant,
      onDone: () => setLoading(false),
      onError: (err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err}` }]);
        setLoading(false);
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:shadow-card-hover transition-all bg-purple-50 text-purple-600"
      >
        <Sparkles className="w-6 h-6" />
        <span className="text-xs font-medium">{t('task.ai')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="col-span-3 mt-3 border border-border rounded-2xl bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{t('task.ai')}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="h-48 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('task.ai.hint') || 'Describe your task and I\'ll help you improve it'}
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] text-sm px-3 py-2 rounded-xl ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt="" className="w-32 h-24 object-cover rounded-lg mb-1" />
                    )}
                    {m.content}
                    {m.role === 'assistant' && onApplySuggestion && (
                      <button
                        type="button"
                        onClick={() => onApplySuggestion(m.content)}
                        className="block text-xs text-primary mt-1 hover:underline"
                      >
                        ↳ Apply
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Attached image preview */}
            {attachedImage && (
              <div className="px-3 pb-1 flex items-center gap-2">
                <img src={attachedImage} alt="" className="w-12 h-12 object-cover rounded-lg border border-border" />
                <button type="button" onClick={() => setAttachedImage(null)} className="text-xs text-destructive hover:underline">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 border-t border-border">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="..."
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  attachedImage
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={t('task.ai.attachPhoto')}
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!voice.isSupported) {
                    const text = window.prompt(t('task.voice.unsupported') || 'Voice input is not supported in this browser. Type your message:');
                    if (text) setInput(prev => (prev ? prev + ' ' : '') + text);
                    return;
                  }
                  if (voice.isListening) {
                    voice.stop();
                    if (voice.transcript) {
                      setInput(prev => (prev ? prev + ' ' : '') + voice.transcript);
                      voice.reset();
                    }
                  } else {
                    voice.start((text) => {
                      setInput(text);
                    });
                  }
                }}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  voice.isListening
                    ? 'bg-destructive text-destructive-foreground animate-pulse'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={t('task.voice') || 'Voice input'}
              >
                {voice.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={loading || (!input.trim() && !attachedImage)}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
